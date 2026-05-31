import { describe, it, expect } from "vitest";
import { calcTaxFromPreTax, calcTaxFromNet, isTaxConsistent } from "./taxCalc";

describe("사업소득 세금 자동 계산", () => {
  it("세전 1,000,000원이면 원천세 30,000 / 주민세 3,000 / 실지급 967,000", () => {
    const t = calcTaxFromPreTax(1_000_000);
    expect(t.withholdingTax).toBe(30_000);
    expect(t.residentTax).toBe(3_000);
    expect(t.netAmount).toBe(967_000);
  });

  it("총 공제율은 세전 기준 3.3%", () => {
    const t = calcTaxFromPreTax(500_000);
    const deducted = t.withholdingTax + t.residentTax;
    expect(deducted).toBe(16_500); // 500,000 * 3.3%
    expect(t.netAmount).toBe(483_500);
  });

  it("0원이나 음수는 0으로 처리한다", () => {
    expect(calcTaxFromPreTax(0).netAmount).toBe(0);
    expect(calcTaxFromPreTax(-100).withholdingTax).toBe(0);
  });

  it("실지급액에서 세전을 역산해도 일관성이 유지된다", () => {
    const t = calcTaxFromNet(967_000);
    expect(t.preTaxAmount).toBe(1_000_000);
    expect(t.netAmount).toBe(967_000);
  });

  it("isTaxConsistent는 자동 계산값과 일치하는지 판별한다", () => {
    expect(isTaxConsistent({ preTaxAmount: 1_000_000, withholdingTax: 30_000, residentTax: 3_000 })).toBe(true);
    expect(isTaxConsistent({ preTaxAmount: 1_000_000, withholdingTax: 0, residentTax: 0 })).toBe(false);
  });
});

describe("기타소득 세금 자동 계산 (8.8%)", () => {
  it("세전 1,000,000원이면 원천세 80,000 / 주민세 8,000 / 실지급 912,000", () => {
    const t = calcTaxFromPreTax(1_000_000, "기타소득");
    expect(t.withholdingTax).toBe(80_000);
    expect(t.residentTax).toBe(8_000);
    expect(t.netAmount).toBe(912_000);
  });

  it("총 공제율은 세전 기준 8.8%", () => {
    const t = calcTaxFromPreTax(500_000, "기타소득");
    expect(t.withholdingTax + t.residentTax).toBe(44_000); // 500,000 × 8.8%
    expect(t.netAmount).toBe(456_000);
  });

  it("기타소득 실지급액에서 세전을 역산해도 일관성이 유지된다", () => {
    const t = calcTaxFromNet(912_000, "기타소득");
    expect(t.preTaxAmount).toBe(1_000_000);
    expect(t.netAmount).toBe(912_000);
  });

  it("기본값(인자 생략)은 사업소득 3.3%", () => {
    expect(calcTaxFromPreTax(1_000_000).withholdingTax).toBe(30_000);
  });
});
