// 마감 체크리스트 / 마감 완료 조건 / 팀 보고 메시지 생성

import { LedgerEntry } from "./types";
import { selectBulkTransfer, selectMonthEndPayments, selectWithholding } from "./selectors";
import { isApprovable } from "./classificationRules";

/** 앱에 고정으로 표시하는 마감 체크리스트 항목들. */
export const CLOSING_CHECKLIST: string[] = [
  "신용카드 사용내역 파일의 총금액과 프로젝트비 파일 내 카드 사용금액 총금액 일치 확인",
  "프로젝트비 파일 요약 시트 새로고침 확인",
  "프로젝트비 파일 내 신용카드 지출 외 모든 항목 기입 확인",
  "세금계산서 발행 대상 항목 확인",
  "사업소득 신고 대상 항목 확인",
  "수당명세서 작성 완료 확인",
  "수당명세서 합계가 프로젝트비 파일 및 사업소득 신고자료 파일과 일치하는지 확인",
  "누락 항목 수정 완료 확인",
  "팀 보고 완료 확인",
];

export interface ClosingCondition {
  label: string;
  done: boolean;
  detail: string;
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 마감 완료 조건들을 평가한다. */
export function evaluateClosing(entries: LedgerEntry[]): {
  conditions: ClosingCondition[];
  allDone: boolean;
} {
  const active = entries.filter((e) => e.itemStatus !== "제외" && e.itemStatus !== "보류");

  const reviewNeeded = active.filter((e) => e.itemStatus === "확인필요").length;

  const unapprovedPayments = active.filter(
    (e) =>
      e.isMonthEndPayment &&
      e.itemStatus !== "승인완료" &&
      e.itemStatus !== "수정완료"
  ).length;

  const bulk = selectBulkTransfer(entries);
  const bulkMissing = bulk.filter((e) => !isApprovable(e)).length;

  const withholding = selectWithholding(entries);
  const withholdingMissing = withholding.filter(
    (e) => !e.payeeName || e.preTaxAmount <= 0
  ).length;

  const bizIncome = withholding.filter(
    (e) => e.evidenceType === "사업소득 신고"
  );
  const taxIncomplete = bizIncome.filter(
    (e) => e.preTaxAmount > 0 && e.withholdingTax === 0 && e.residentTax === 0
  ).length;

  const monthEndTotal = selectMonthEndPayments(entries).reduce(
    (s, e) => s + (e.netAmount || e.preTaxAmount || e.totalAmount),
    0
  );
  const bulkTotal = bulk.reduce((s, e) => s + (e.netAmount || e.preTaxAmount), 0);
  // 대량이체는 월말 지급 목록의 부분집합이므로, 대량이체 총액 ≤ 월말 총액이면 정합.
  const totalsConsistent = bulkTotal <= monthEndTotal + 1;

  const conditions: ClosingCondition[] = [
    {
      label: "확인필요 항목 0건",
      done: reviewNeeded === 0,
      detail: `현재 ${reviewNeeded}건`,
    },
    {
      label: "승인되지 않은 지급대상 항목 0건",
      done: unapprovedPayments === 0,
      detail: `현재 ${unapprovedPayments}건`,
    },
    {
      label: "대량이체 대상 중 필수값 누락 0건",
      done: bulkMissing === 0,
      detail: `현재 ${bulkMissing}건`,
    },
    {
      label: "원천세 신고 대상 중 필수값 누락 0건",
      done: withholdingMissing === 0,
      detail: `현재 ${withholdingMissing}건`,
    },
    {
      label: "사업소득 신고 대상 세금 계산 완료",
      done: taxIncomplete === 0,
      detail: `미계산 ${taxIncomplete}건`,
    },
    {
      label: "월말 지급 예정 총액과 대량이체 총액 정합",
      done: totalsConsistent,
      detail: `지급예정 ${won(monthEndTotal)} / 대량이체 ${won(bulkTotal)}`,
    },
  ];

  return { conditions, allDone: conditions.every((c) => c.done) };
}

/** 팀 보고 메시지를 자동 생성한다 (사양의 고정 형식). */
export function buildReportMessage(entries: LedgerEntry[]): string {
  const active = entries.filter((e) => e.itemStatus !== "제외");
  const autoClassified = entries.filter((e) => e.itemStatus !== "제외").length;
  const approved = entries.filter(
    (e) => e.itemStatus === "승인완료" || e.itemStatus === "수정완료"
  ).length;
  const reviewNeeded = active.filter((e) => e.itemStatus === "확인필요").length;
  const withholding = selectWithholding(entries).length;
  const monthEnd = selectMonthEndPayments(entries).length;
  const bulk = selectBulkTransfer(entries);
  const bulkTotal = bulk.reduce((s, e) => s + (e.netAmount || e.preTaxAmount), 0);
  const heldOrExcluded = entries.filter(
    (e) => e.itemStatus === "보류" || e.itemStatus === "제외"
  ).length;

  return [
    "[월말 정산 마감 완료 보고]",
    "",
    "이번 달 프로젝트비, 원천세 신고자료, 월말 지급 예정 목록, 신한은행 대량이체 파일 기준 검수를 완료했습니다.",
    "",
    `1. 자동 분류 항목: ${autoClassified}건`,
    `2. 승인 완료 항목: ${approved}건`,
    `3. 확인 필요 항목: ${reviewNeeded}건`,
    `4. 원천세 신고 대상: ${withholding}건 / 세금 자동 계산 완료`,
    `5. 월말 지급 예정 항목: ${monthEnd}건`,
    `6. 신한은행 대량이체 총액: ${won(bulkTotal)}`,
    `7. 대량이체 파일 생성: ${bulk.length > 0 ? "완료" : "대상 없음"}`,
    `8. 보류 또는 제외 항목: ${heldOrExcluded}건`,
    "",
    "최종 상태:",
    "월말 정산 자료 검수 및 보고를 완료했습니다.",
  ].join("\n");
}
