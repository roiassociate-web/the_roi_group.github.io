// 엑셀 출력물 생성 — SheetJS로 .xlsx를 새로 만들어 다운로드한다.
//
// 모든 출력물은 정산원장에서 파생되며, 다시 열었을 때 컬럼 순서와 값이
// 깨지지 않도록 명시적인 헤더 순서로 시트를 구성한다.

import * as XLSX from "xlsx";
import { LedgerEntry } from "./types";
import { bankNameToCode } from "./bankCodes";
import {
  selectBulkTransfer,
  selectLedger,
  selectMonthEndPayments,
  selectProjectCost,
  selectWithholding,
  selectAllowance,
  selectHeld,
  selectExcluded,
} from "./selectors";
import { evaluateClosing } from "./closing";
import { IncentiveStatement } from "./incentive";

/** 헤더 순서를 고정해 객체 배열을 시트로 만든다(컬럼 깨짐 방지). */
function sheetFromRows(headers: string[], rows: Record<string, unknown>[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  // 헤더만 강제로 다시 써서 빈 데이터일 때도 컬럼이 보이게 한다.
  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A1" });
  return ws;
}

function downloadWorkbook(wb: XLSX.WorkBook, fileName: string): void {
  XLSX.writeFile(wb, fileName, { bookType: "xlsx", compression: true });
}

const yn = (b: boolean) => (b ? "Y" : "N");

/**
 * 실제 지급/이체 금액을 결정한다.
 * - 사업소득(원천세 계산됨): 실지급액
 * - 그 외(세금계산서 등): 부가세 포함 총금액
 */
export function payableAmount(e: LedgerEntry): number {
  if (e.evidenceType === "사업소득 신고" && e.netAmount > 0) return e.netAmount;
  return e.totalAmount || e.preTaxAmount || e.netAmount;
}

// ---------------------------------------------------------------------------
// 1) 정산원장 엑셀
// ---------------------------------------------------------------------------
const LEDGER_HEADERS = [
  "정산ID", "귀속월", "지급월", "신고월", "고객사명", "프로젝트명",
  "대상자명/업체명", "개인/업체", "비용유형", "증빙방식",
  "원천세대상", "소득구분", "프로젝트비반영", "월말지급대상", "대량이체포함",
  "지급상태", "지급방법", "공급가액", "부가세", "총금액",
  "세전지급액", "원천세", "주민세", "실지급액",
  "지급일", "주민/사업자번호", "은행명", "은행코드", "계좌번호", "예금주",
  "담당자", "메모", "처리상태", "신뢰도", "확인필요사유",
];

function ledgerRow(e: LedgerEntry): Record<string, unknown> {
  return {
    정산ID: e.settlementId,
    귀속월: e.attributionMonth,
    지급월: e.paymentMonth,
    신고월: e.reportMonth,
    고객사명: e.clientName,
    프로젝트명: e.projectName,
    "대상자명/업체명": e.payeeName,
    "개인/업체": e.partyType,
    비용유형: e.costType,
    증빙방식: e.evidenceType,
    원천세대상: yn(e.isWithholding),
    소득구분: e.withholdingType ?? "사업소득",
    프로젝트비반영: yn(e.isProjectCost),
    월말지급대상: yn(e.isMonthEndPayment),
    대량이체포함: yn(e.isBulkTransfer),
    지급상태: e.paymentStatus,
    지급방법: e.paymentMethod,
    공급가액: e.supplyAmount,
    부가세: e.vat,
    총금액: e.totalAmount,
    세전지급액: e.preTaxAmount,
    원천세: e.withholdingTax,
    주민세: e.residentTax,
    실지급액: e.netAmount,
    지급일: e.paymentDate,
    "주민/사업자번호": e.idOrBizNumber ?? "",
    은행명: e.bankName,
    은행코드: e.bankCode,
    계좌번호: e.accountNumber,
    예금주: e.accountHolder,
    담당자: e.manager,
    메모: e.memo,
    처리상태: e.itemStatus,
    신뢰도: e.confidence,
    확인필요사유: e.reviewReasons.join(" / "),
  };
}

export function exportLedger(entries: LedgerEntry[]): void {
  const rows = selectLedger(entries).map(ledgerRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(LEDGER_HEADERS, rows), "정산원장");
  downloadWorkbook(wb, `정산원장_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// 2) 프로젝트비 관리자료 엑셀
// ---------------------------------------------------------------------------
export function exportProjectCost(entries: LedgerEntry[]): void {
  const headers = ["귀속월", "고객사명", "프로젝트명", "비용유형", "증빙방식", "대상자명/업체명", "총금액", "지급상태", "메모"];
  const rows = selectProjectCost(entries).map((e) => ({
    귀속월: e.attributionMonth,
    고객사명: e.clientName,
    프로젝트명: e.projectName,
    비용유형: e.costType,
    증빙방식: e.evidenceType,
    "대상자명/업체명": e.payeeName,
    총금액: e.totalAmount || e.preTaxAmount,
    지급상태: e.paymentStatus,
    메모: e.memo,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(headers, rows), "프로젝트비");
  downloadWorkbook(wb, `프로젝트비_관리자료_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// 3) 수당명세서용 자료 엑셀
// ---------------------------------------------------------------------------
export function exportAllowance(entries: LedgerEntry[]): void {
  const headers = ["지급월", "성명", "프로젝트명", "비용유형", "세전지급액", "원천세", "주민세", "실지급액", "은행명", "계좌번호"];
  const rows = selectAllowance(entries).map((e) => ({
    지급월: e.paymentMonth,
    성명: e.payeeName,
    프로젝트명: e.projectName,
    비용유형: e.costType,
    세전지급액: e.preTaxAmount,
    원천세: e.withholdingTax,
    주민세: e.residentTax,
    실지급액: e.netAmount,
    은행명: e.bankName,
    계좌번호: e.accountNumber,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(headers, rows), "수당명세서");
  downloadWorkbook(wb, `수당명세서_자료_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// 4) 원천세 신고자료 엑셀 (세전/원천세/주민세/실지급액 모두 포함)
// ---------------------------------------------------------------------------
export function exportWithholding(entries: LedgerEntry[]): void {
  const headers = ["신고월", "성명/업체명", "주민/사업자번호", "개인/업체", "소득구분", "비용유형", "세전지급액", "원천세", "주민세", "실지급액", "지급일", "메모"];
  const rows = selectWithholding(entries).map((e) => ({
    신고월: e.reportMonth,
    "성명/업체명": e.payeeName,
    "주민/사업자번호": e.idOrBizNumber ?? "",
    "개인/업체": e.partyType,
    소득구분: e.withholdingType ?? "사업소득",
    비용유형: e.costType,
    세전지급액: e.preTaxAmount,
    원천세: e.withholdingTax,
    주민세: e.residentTax,
    실지급액: e.netAmount,
    지급일: e.paymentDate,
    메모: e.memo,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(headers, rows), "원천세신고자료");
  downloadWorkbook(wb, `원천세_신고자료_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// 5) 월말 지급 예정 목록 엑셀
// ---------------------------------------------------------------------------
export function exportMonthEndPayments(entries: LedgerEntry[]): void {
  const headers = ["지급월", "대상자명/업체명", "프로젝트명", "비용유형", "지급방법", "실지급액", "은행명", "계좌번호", "예금주", "지급상태"];
  const list = selectMonthEndPayments(entries);
  const rows: Record<string, unknown>[] = list.map((e) => ({
    지급월: e.paymentMonth,
    "대상자명/업체명": e.payeeName,
    프로젝트명: e.projectName,
    비용유형: e.costType,
    지급방법: e.paymentMethod,
    실지급액: payableAmount(e),
    은행명: e.bankName,
    계좌번호: e.accountNumber,
    예금주: e.accountHolder,
    지급상태: e.paymentStatus,
  }));
  const total = rows.reduce((s, r) => s + Number(r.실지급액 || 0), 0);
  rows.push({
    지급월: "", "대상자명/업체명": "합계", 프로젝트명: "", 비용유형: "",
    지급방법: "", 실지급액: total, 은행명: "", 계좌번호: "", 예금주: "", 지급상태: "",
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(headers, rows), "월말지급예정");
  downloadWorkbook(wb, `월말지급예정목록_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// 6) 신한은행 대량이체 파일 (컬럼 순서 엄수)
// ---------------------------------------------------------------------------
export const BULK_TRANSFER_HEADERS = [
  "*입금은행", "*입금계좌", "고객관리성명", "*입금액",
  "출금통장표시내용", "입금통장표시내용", "입금인코드", "비고",
];

export function buildBulkTransferRows(entries: LedgerEntry[]): Record<string, unknown>[] {
  return selectBulkTransfer(entries).map((e) => ({
    "*입금은행": e.bankCode || bankNameToCode(e.bankName),
    "*입금계좌": e.accountNumber,
    고객관리성명: e.accountHolder || e.payeeName,
    "*입금액": payableAmount(e), // 사업소득은 실지급액, 그 외는 총금액(세전 아님)
    출금통장표시내용: e.payeeName,
    입금통장표시내용: e.projectName || "더로이그룹",
    입금인코드: "",
    비고: e.projectName || e.costType,
  }));
}

export function exportBulkTransfer(entries: LedgerEntry[]): void {
  const rows = buildBulkTransferRows(entries);
  const wb = XLSX.utils.book_new();
  const ws = sheetFromRows(BULK_TRANSFER_HEADERS, rows);
  XLSX.utils.book_append_sheet(wb, ws, "대량이체");
  downloadWorkbook(wb, `신한은행_대량이체_${stamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// 7) 월말 정산 검수 리포트
// ---------------------------------------------------------------------------
export function exportInspectionReport(entries: LedgerEntry[]): void {
  const { conditions, allDone } = evaluateClosing(entries);
  const bulk = selectBulkTransfer(entries);
  const monthEnd = selectMonthEndPayments(entries);
  const bulkTotal = bulk.reduce((s, e) => s + (e.netAmount || e.preTaxAmount), 0);
  const monthEndTotal = monthEnd.reduce(
    (s, e) => s + (e.netAmount || e.preTaxAmount || e.totalAmount), 0
  );

  const summaryHeaders = ["항목", "값"];
  const summary = [
    { 항목: "전체 항목", 값: entries.length },
    { 항목: "자동분류됨", 값: entries.filter((e) => e.itemStatus === "자동분류됨").length },
    { 항목: "확인필요", 값: entries.filter((e) => e.itemStatus === "확인필요").length },
    { 항목: "승인완료", 값: entries.filter((e) => e.itemStatus === "승인완료").length },
    { 항목: "수정완료", 값: entries.filter((e) => e.itemStatus === "수정완료").length },
    { 항목: "보류", 값: selectHeld(entries).length },
    { 항목: "제외", 값: selectExcluded(entries).length },
    { 항목: "원천세 신고 대상", 값: selectWithholding(entries).length },
    { 항목: "월말 지급 예정", 값: monthEnd.length },
    { 항목: "월말 지급 예정 총액", 값: monthEndTotal },
    { 항목: "대량이체 대상", 값: bulk.length },
    { 항목: "대량이체 총액", 값: bulkTotal },
    { 항목: "마감 완료 여부", 값: allDone ? "마감 완료" : "진행 중" },
  ];

  const condHeaders = ["마감 조건", "충족", "상세"];
  const condRows = conditions.map((c) => ({
    "마감 조건": c.label,
    충족: c.done ? "O" : "X",
    상세: c.detail,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(summaryHeaders, summary), "검수요약");
  XLSX.utils.book_append_sheet(wb, sheetFromRows(condHeaders, condRows), "마감조건");
  downloadWorkbook(wb, `월말정산_검수리포트_${stamp()}.xlsx`);
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 8) 수당명세서 (성과 수당) — 수령자별 시트
// ---------------------------------------------------------------------------
export function exportIncentiveStatements(statements: IncentiveStatement[], month: string): void {
  const headers = ["프로젝트", "고객사", "교육명", "역할", "비율", "수금공급가액", "비용", "매출이익(수금-비용)", "산출수당"];
  const wb = XLSX.utils.book_new();

  if (statements.length === 0) {
    XLSX.utils.book_append_sheet(wb, sheetFromRows(headers, []), "수당명세서");
  }
  for (const st of statements) {
    const rows: Record<string, unknown>[] = st.lines.map((l) => ({
      프로젝트: l.projectName,
      고객사: l.clientName,
      교육명: l.educationName,
      역할: l.role || "(미지정)",
      비율: l.rate ? `${Math.round(l.rate * 100)}%` : "-",
      수금공급가액: l.revenue,
      비용: l.cost,
      "매출이익(수금-비용)": l.margin,
      산출수당: l.incentive,
    }));
    rows.push({
      프로젝트: "합계", 고객사: "", 교육명: "", 역할: "", 비율: "",
      수금공급가액: "", 비용: "", "매출이익(수금-비용)": "", 산출수당: st.total,
    });
    // 시트명은 31자 제한 + 특수문자 회피
    const safe = `${st.recipient}`.replace(/[\\/?*\[\]:]/g, " ").slice(0, 28) || "수령자";
    XLSX.utils.book_append_sheet(wb, sheetFromRows(headers, rows), safe);
  }
  downloadWorkbook(wb, `수당명세서_${month}_${stamp()}.xlsx`);
}
