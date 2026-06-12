// 파일 파싱 — 브라우저에서 SheetJS로 엑셀/CSV를 읽고,
// 텍스트 메모도 행으로 변환한 뒤 자동 분류 후보를 만든다.

import * as XLSX from "xlsx";
import { LedgerEntry, RevenueReceipt } from "./types";
import { classifyRow, ClassifyContext } from "./classificationRules";
import { matchProjectAlias } from "./masters";

export interface MonthGuess {
  attributionMonth: string; // 귀속월 (YYYY-MM)
  paymentMonth: string; // 지급월
  reportMonth: string; // 신고월
  detectedFromName: boolean;
}

/**
 * 파일명에서 연/월을 읽어 귀속월·지급월·신고월 후보를 만든다.
 * 예: "수당명세서_6월.xlsx" → 지급월 6월 후보.
 * 연도가 없으면 올해를 사용한다.
 */
export function guessMonthFromFileName(fileName: string, today = new Date()): MonthGuess {
  const year = today.getFullYear();
  // "2026-06", "2026년 6월", "6월", "06" 등 다양한 표기를 흡수
  const ymMatch = fileName.match(/(20\d{2})[\s._-]*년?[\s._-]*(\d{1,2})\s*월?/);
  const mOnly = fileName.match(/(\d{1,2})\s*월/);

  let y = year;
  let m = today.getMonth() + 1;
  let detected = false;

  if (ymMatch) {
    y = Number(ymMatch[1]);
    m = Number(ymMatch[2]);
    detected = true;
  } else if (mOnly) {
    m = Number(mOnly[1]);
    detected = true;
  }

  const mm = String(Math.min(Math.max(m, 1), 12)).padStart(2, "0");
  const ym = `${y}-${mm}`;
  // 기본값: 귀속월=지급월=신고월. 최종 확정 전 확인 질문으로 보정한다.
  return {
    attributionMonth: ym,
    paymentMonth: ym,
    reportMonth: ym,
    detectedFromName: detected,
  };
}

/** 시트의 2차원 배열을 헤더 기반 객체 배열로 바꾼다. */
function sheetToRecords(sheet: XLSX.WorkSheet): Record<string, string | number | null>[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });
  return rows.map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(r)) {
      out[String(k).trim()] = v == null ? null : (v as string | number);
    }
    return out;
  });
}

let GLOBAL_SEQ = 1;

/** 엑셀/CSV 파일 하나를 파싱해 분류된 항목 배열을 반환한다. */
export async function parseSpreadsheetFile(file: File): Promise<LedgerEntry[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const month = guessMonthFromFileName(file.name);
  const entries: LedgerEntry[] = [];

  for (const sheetName of wb.SheetNames) {
    const records = sheetToRecords(wb.Sheets[sheetName]);
    records.forEach((cells, idx) => {
      // 의미 있는 값이 하나도 없는 행은 건너뛴다.
      const hasValue = Object.values(cells).some(
        (v) => v != null && String(v).trim() !== ""
      );
      if (!hasValue) return;

      const ctx: ClassifyContext = {
        sourceFile: file.name,
        sheetName,
        rowIndex: idx,
        attributionMonth: month.attributionMonth,
        paymentMonth: month.paymentMonth,
        reportMonth: month.reportMonth,
        idSeq: GLOBAL_SEQ++,
      };
      entries.push(classifyRow(cells, ctx));
    });
  }
  return entries;
}

/**
 * 텍스트 메모를 파싱한다. 한 줄당 한 항목으로 본다.
 * 예) "삼송 AX 강사비 김철수 1,000,000 신한 110-123-456789 지급예정"
 * 자유 형식이므로 줄 전체를 메모/항목명으로 넣고 키워드 분류에 맡긴다.
 */
export function parseTextMemo(text: string, fileName = "메모.txt"): LedgerEntry[] {
  const month = guessMonthFromFileName(fileName);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((line, idx) => {
    // 줄에서 토큰을 뽑아 가벼운 셀 맵을 만든다.
    const amountMatch = line.match(/([\d,]{4,})\s*원?/);
    const bankMatch = line.match(/(국민|신한|우리|하나|농협|기업|카카오|토스|새마을|우체국|SC제일|씨티)\S*/);
    const accountMatch = line.match(/(\d[\d-]{6,}\d)/);

    const cells: Record<string, string | number | null> = {
      항목명: line,
      메모: line,
      금액: amountMatch ? amountMatch[1] : null,
      은행: bankMatch ? bankMatch[0] : null,
      계좌번호: accountMatch ? accountMatch[1] : null,
    };

    const ctx: ClassifyContext = {
      sourceFile: fileName,
      sheetName: "메모",
      rowIndex: idx,
      attributionMonth: month.attributionMonth,
      paymentMonth: month.paymentMonth,
      reportMonth: month.reportMonth,
      idSeq: GLOBAL_SEQ++,
    };
    return classifyRow(cells, ctx);
  });
}

// ---------------------------------------------------------------------------
// 매출 수금 — 신한은행 입금내역 파싱
// ---------------------------------------------------------------------------

let RECEIPT_SEQ = 1;

function pickCell(cells: Record<string, unknown>, candidates: string[]): string {
  for (const cand of candidates) {
    for (const key of Object.keys(cells)) {
      if (key.replace(/\s+/g, "").includes(cand)) {
        const v = cells[key];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  return "";
}

function pickNumber(cells: Record<string, unknown>, candidates: string[]): number {
  const raw = pickCell(cells, candidates);
  if (!raw) return 0;
  const n = Number(raw.replace(/[,\\₩원\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 컬럼명을 '정확히' 매칭한다(부분 일치로 인한 오인 방지: 입금액 vs 입금인코드). */
function exactCell(cells: Record<string, unknown>, names: string[]): string {
  for (const key of Object.keys(cells)) {
    const nk = key.replace(/\s+/g, "");
    if (names.includes(nk)) {
      const v = cells[key];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

function exactNumber(cells: Record<string, unknown>, names: string[]): number {
  const raw = exactCell(cells, names);
  if (!raw) return 0;
  const n = Number(raw.replace(/[,\\₩원\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hasColumn(cells: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(cells).some((k) => names.includes(k.replace(/\s+/g, "")));
}

/** 엑셀 날짜(숫자 시리얼 또는 문자열)를 YYYY-MM-DD로 정규화. */
function normDate(raw: string): string {
  if (!raw) return "";
  // "2026-03-05 14:23:01" / "2026.03.05" 등 문자열 날짜
  const m = raw.match(/(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // 엑셀 시리얼(날짜 또는 날짜+시간 소수)
  if (/^\d{4,6}(\.\d+)?$/.test(raw)) {
    const serial = Math.floor(Number(raw));
    const ms = (serial - 25569) * 86400 * 1000; // 1970-01-01 기준
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return raw;
}

/**
 * 매출 수금이 아닌 '환불 입금'으로 의심되는 키워드.
 * (카카오·쿠팡·KTX 등 비용 환불은 수당 계산에서 빼야 한다)
 * 여기만 고치면 제외 규칙을 쉽게 바꿀 수 있다.
 */
export const REFUND_KEYWORDS = [
  "환불", "취소", "반품", "결제취소",
  "카카오", "쿠팡", "ktx", "코레일", "기차", "철도",
  "네이버페이", "토스페이", "배민", "요기요", "11번가", "지마켓", "옥션",
  "인터파크", "야놀자", "여기어때", "대한항공", "아시아나", "항공", "스타벅스",
];

/** 내용/적요가 환불 입금으로 보이는지 판단한다. */
export function looksLikeRefund(text: string): string {
  const t = (text || "").toLowerCase();
  for (const k of REFUND_KEYWORDS) {
    if (t.includes(k.toLowerCase())) return k;
  }
  return "";
}

/**
 * 신한은행 입금내역 파일을 파싱해 매출 수금 후보를 만든다.
 * 입금액이 있는 행만 사용하고, 내용에서 프로젝트를 추측한다.
 * 환불 의심 입금은 '제외'로 표시한다.
 */
export async function parseDepositFile(file: File): Promise<RevenueReceipt[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const month = guessMonthFromFileName(file.name);
  const out: RevenueReceipt[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
      defval: null,
      raw: false,
    });
    const depCol = hasColumn(rows[0] ?? {}, ["입금액", "입금금액", "맡기신금액"]);
    for (const cells of rows) {
      // 입금액 컬럼이 있으면 그것만(출금 행 자동 제외), 없으면 일반 금액 컬럼으로 폴백.
      const amount = depCol
        ? exactNumber(cells, ["입금액", "입금금액", "맡기신금액"])
        : pickNumber(cells, ["금액", "거래금액", "공급가"]);
      if (amount <= 0) continue; // 입금 있는 행만(매출 수금)

      // 신한은행: 보낸 회사 단서는 '내용'에 있다. 내용 우선 + 적요/메모 보조.
      const content = pickCell(cells, ["내용", "거래내용"]);
      const summary = pickCell(cells, ["적요", "입금자", "보낸분", "의뢰인"]);
      const memoCol = pickCell(cells, ["메모", "비고"]);
      const clue = [content, summary, memoCol].filter(Boolean).join(" ");

      const dateRaw = pickCell(cells, ["거래일시", "거래일자", "거래일", "일자", "날짜", "date"]);
      const receiptDate = normDate(dateRaw);
      const bankName = "신한은행";

      // '내용'에서 프로젝트(고객사) 추측
      const matched = matchProjectAlias(content) || matchProjectAlias(clue);
      // 환불 입금(카카오·쿠팡·KTX 등)은 매출 수금이 아니므로 제외 표시
      const refund = looksLikeRefund(clue);

      out.push({
        id: `R-${RECEIPT_SEQ++}`,
        receiptMonth: receiptDate ? receiptDate.slice(0, 7) : month.paymentMonth,
        clientName: matched?.canonicalClient ?? "",
        projectName: matched?.canonicalProject ?? "",
        bankName,
        receiptDate,
        supplyAmount: amount,
        memo: (content || clue).slice(0, 60),
        confirmed: false,
        rawText: clue || content,
        excluded: !!refund,
        excludeReason: refund ? `${refund} — 환불 입금으로 보여요` : "",
      });
    }
  }
  return out;
}
