// 정산원장에서 목적별 출력물의 대상 항목을 골라내는 순수 선택자들.
// "정산원장 하나 → 목적별 파생" 원칙을 코드로 표현한다.

import { LedgerEntry } from "./types";
import { isApprovable } from "./classificationRules";

/** 마감 대상이 되는 활성 항목 (제외/보류 제외, 승인/수정완료/자동분류). */
function isActive(e: LedgerEntry): boolean {
  return e.itemStatus !== "제외" && e.itemStatus !== "보류";
}

/** 승인되어 원장에 확정 반영된 항목. */
export function selectLedger(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(isActive);
}

/** 프로젝트비 반영 대상. */
export function selectProjectCost(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => isActive(e) && e.isProjectCost);
}

/**
 * 원천세 신고자료 대상 = 원천세대상여부 true.
 * 세금계산서/신용카드/단순지출은 규칙상 제외되어 있다.
 */
export function selectWithholding(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => isActive(e) && e.isWithholding);
}

/** 수당명세서용 자료 = 개인 지급(강사비/용역비/아르바이트비/성과수당). */
export function selectAllowance(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(
    (e) =>
      isActive(e) &&
      e.partyType === "개인" &&
      ["강사비", "용역비", "아르바이트비", "직원 성과수당", "사업소득"].includes(
        e.costType
      )
  );
}

/** 월말 지급 예정 목록 = 월말지급대상 && 지급예정. */
export function selectMonthEndPayments(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(
    (e) => isActive(e) && e.isMonthEndPayment && e.paymentStatus === "지급예정"
  );
}

/**
 * 신한은행 대량이체 대상.
 * 대량이체포함여부 true + 지급예정 + 계좌정보 완비 + 승인 가능.
 */
export function selectBulkTransfer(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(
    (e) =>
      isActive(e) &&
      e.isBulkTransfer &&
      e.paymentStatus === "지급예정" &&
      e.costType !== "신용카드" &&
      !!e.bankName &&
      !!e.accountNumber &&
      !!e.accountHolder &&
      (e.netAmount || e.preTaxAmount) > 0 &&
      isApprovable(e)
  );
}

/** 보류 항목. */
export function selectHeld(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => e.itemStatus === "보류");
}

/** 제외 항목 (제외 로그). */
export function selectExcluded(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => e.itemStatus === "제외");
}
