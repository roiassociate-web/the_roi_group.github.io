// 원천징수 세금 자동 계산 (사업소득 3.3% / 기타소득 8.8%)
//
// 계산 기준:
//   [사업소득]  원천세 = 세전 × 3%,  주민세 = 원천세 × 10%  → 총 공제율 3.3%
//   [기타소득]  원천세 = 세전 × 8%,  주민세 = 원천세 × 10%  → 총 공제율 8.8%
//     · 기타소득은 필요경비 60%를 차감한 과세표준(40%)에 소득세 20%를 적용하므로
//       세전 기준 실효 소득세율이 8%가 된다(40% × 20%). 주민세는 소득세의 10%.
//   실지급액 = 세전 - 원천세 - 주민세
//
// 이 파일은 다른 곳에서 import 해 쓰는 순수 함수만 둔다(테스트 용이).

import { WithholdingType } from "./types";

export const RESIDENT_RATE = 0.1; // 주민세율 = 원천세(소득세)의 10%

// 원천징수 유형별 세전 기준 소득세율
export const WITHHOLDING_RATES: Record<
  WithholdingType,
  { incomeRate: number; totalLabel: string }
> = {
  사업소득: { incomeRate: 0.03, totalLabel: "3.3%" },
  기타소득: { incomeRate: 0.08, totalLabel: "8.8%" },
};

// 하위 호환: 기존 코드가 참조하던 사업소득 기본 세율
export const WITHHOLDING_RATE = WITHHOLDING_RATES.사업소득.incomeRate;

export interface TaxResult {
  preTaxAmount: number; // 세전 지급액
  withholdingTax: number; // 원천세(소득세)
  residentTax: number; // 주민세
  netAmount: number; // 실지급액
}

/** 원 단위로 내림 정리 (세금은 통상 원단위 절사). */
function floorWon(n: number): number {
  return Math.floor(n);
}

/** 유형의 총 공제율(세전 기준). 사업소득 0.033 / 기타소득 0.088. */
export function totalDeductionRate(type: WithholdingType): number {
  const r = WITHHOLDING_RATES[type].incomeRate;
  return r + r * RESIDENT_RATE;
}

/**
 * 세전 지급액을 기준으로 원천세/주민세/실지급액을 계산한다.
 * type 기본값은 사업소득(3.3%).
 */
export function calcTaxFromPreTax(
  preTaxAmount: number,
  type: WithholdingType = "사업소득"
): TaxResult {
  const safe = Number.isFinite(preTaxAmount) ? Math.max(0, preTaxAmount) : 0;
  const incomeRate = WITHHOLDING_RATES[type].incomeRate;
  const withholdingTax = floorWon(safe * incomeRate);
  const residentTax = floorWon(withholdingTax * RESIDENT_RATE);
  const netAmount = safe - withholdingTax - residentTax;
  return { preTaxAmount: safe, withholdingTax, residentTax, netAmount };
}

/**
 * 실지급액(실제 입금액)을 기준으로 세전 지급액을 역산한다.
 * 사용자가 "이 금액은 실지급액"이라고 답한 경우에 사용한다.
 */
export function calcTaxFromNet(
  netAmount: number,
  type: WithholdingType = "사업소득"
): TaxResult {
  const safe = Number.isFinite(netAmount) ? Math.max(0, netAmount) : 0;
  const preTax = floorWon(safe / (1 - totalDeductionRate(type)));
  // 역산한 세전 금액으로 다시 정방향 계산해 일관성을 맞춘다.
  return calcTaxFromPreTax(preTax, type);
}

/** 자동 계산값과 입력값이 일치하는지(수동 수정 여부 판단용). */
export function isTaxConsistent(entry: {
  preTaxAmount: number;
  withholdingTax: number;
  residentTax: number;
  withholdingType?: WithholdingType;
}): boolean {
  const expected = calcTaxFromPreTax(entry.preTaxAmount, entry.withholdingType ?? "사업소득");
  return (
    expected.withholdingTax === entry.withholdingTax &&
    expected.residentTax === entry.residentTax
  );
}
