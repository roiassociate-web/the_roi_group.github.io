// 파일 파싱 — 브라우저에서 SheetJS로 엑셀/CSV를 읽고,
// 텍스트 메모도 행으로 변환한 뒤 자동 분류 후보를 만든다.

import * as XLSX from "xlsx";
import { LedgerEntry } from "./types";
import { classifyRow, ClassifyContext } from "./classificationRules";

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
