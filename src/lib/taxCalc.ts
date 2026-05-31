// 사업소득 신고 대상 세금 자동 계산
//
// 계산 기준 (사양):
//   원천세   = 세전 지급액 × 3%
//   주민세   = 원천세 × 10%
//   실지급액 = 세전 지급액 - 원천세 - 주민세
//   총 공제율 = 세전 지급액 기준 3.3%
//
// 이 파일은 다른 곳에서 import 해 쓰는 순수 함수만 둔다(테스트 용이).

export const WITHHOLDING_RATE = 0.03; // 원천세율 3%
export const RESIDENT_RATE = 0.1; // 주민세율 = 원천세의 10%

export interface TaxResult {
  preTaxAmount: number; // 세전 지급액
  withholdingTax: number; // 원천세
  residentTax: number; // 주민세
  netAmount: number; // 실지급액
}

/** 원 단위로 내림 정리 (세금은 통상 원단위 절사). */
function floorWon(n: number): number {
  return Math.floor(n);
}

/**
 * 세전 지급액을 기준으로 원천세/주민세/실지급액을 계산한다.
 */
export function calcTaxFromPreTax(preTaxAmount: number): TaxResult {
  const safe = Number.isFinite(preTaxAmount) ? Math.max(0, preTaxAmount) : 0;
  const withholdingTax = floorWon(safe * WITHHOLDING_RATE);
  const residentTax = floorWon(withholdingTax * RESIDENT_RATE);
  const netAmount = safe - withholdingTax - residentTax;
  return {
    preTaxAmount: safe,
    withholdingTax,
    residentTax,
    netAmount,
  };
}

/**
 * 실지급액(실제 입금액)을 기준으로 세전 지급액을 역산한다.
 * 사용자가 "이 금액은 실지급액"이라고 답한 경우에 사용한다.
 * 실지급액 = 세전 × (1 - 0.033) 이므로 세전 = 실지급액 / 0.967.
 */
export function calcTaxFromNet(netAmount: number): TaxResult {
  const safe = Number.isFinite(netAmount) ? Math.max(0, netAmount) : 0;
  const preTax = floorWon(safe / (1 - WITHHOLDING_RATE - WITHHOLDING_RATE * RESIDENT_RATE));
  // 역산한 세전 금액으로 다시 정방향 계산해 일관성을 맞춘다.
  return calcTaxFromPreTax(preTax);
}

/** 자동 계산값과 입력값이 일치하는지(수동 수정 여부 판단용). */
export function isTaxConsistent(entry: {
  preTaxAmount: number;
  withholdingTax: number;
  residentTax: number;
}): boolean {
  const expected = calcTaxFromPreTax(entry.preTaxAmount);
  return (
    expected.withholdingTax === entry.withholdingTax &&
    expected.residentTax === entry.residentTax
  );
}
