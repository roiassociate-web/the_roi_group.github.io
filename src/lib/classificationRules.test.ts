import { describe, it, expect } from "vitest";
import { classifyRow, ClassifyContext, applyDefaultFlags } from "./classificationRules";
import { LedgerEntry } from "./types";

function ctx(): ClassifyContext {
  return {
    sourceFile: "테스트_5월.xlsx",
    sheetName: "s",
    rowIndex: 0,
    attributionMonth: "2026-05",
    paymentMonth: "2026-05",
    reportMonth: "2026-05",
    idSeq: 1,
  };
}

describe("자동 분류 규칙", () => {
  it("규칙1: 신용카드 지출은 프로젝트비 반영, 월말지급/대량이체 제외", () => {
    const e = classifyRow(
      { 비용유형: "신용카드", 대상자: "법인카드", 금액: 50000, 지급상태: "지급완료" },
      ctx()
    );
    expect(e.isProjectCost).toBe(true);
    expect(e.isMonthEndPayment).toBe(false);
    expect(e.isBulkTransfer).toBe(false);
    expect(e.isWithholding).toBe(false);
  });

  it("규칙2/3: 개인 강사비는 원천세+월말지급 대상이며 세금이 자동 계산된다", () => {
    const e = classifyRow(
      {
        비용유형: "강사비",
        대상자: "김철수",
        세전지급액: 1_000_000,
        은행: "신한은행",
        계좌번호: "110-123-456789",
        예금주: "김철수",
        지급상태: "지급예정",
      },
      ctx()
    );
    expect(e.partyType).toBe("개인");
    expect(e.isWithholding).toBe(true);
    expect(e.isMonthEndPayment).toBe(true);
    expect(e.withholdingTax).toBe(30_000);
    expect(e.netAmount).toBe(967_000);
    expect(e.isBulkTransfer).toBe(true); // 계좌 완비 + 지급예정
  });

  it("규칙5/6: 세금계산서 업체 비용은 원천세 제외, 미지급이면 월말지급 포함", () => {
    const e = classifyRow(
      { 비용유형: "세금계산서", 업체명: "(주)교재나라", 공급가액: 500000, 부가세: 50000, 지급상태: "지급예정" },
      ctx()
    );
    expect(e.isWithholding).toBe(false);
    expect(e.isProjectCost).toBe(true);
    expect(e.isMonthEndPayment).toBe(true);
  });

  it("규칙4/7: 지급완료 항목은 대량이체에서 제외", () => {
    const base = classifyRow(
      { 비용유형: "용역비", 대상자: "정프리", 세전지급액: 800000, 은행: "국민은행", 계좌번호: "012-45-67890", 예금주: "정프리", 지급상태: "지급완료" },
      ctx()
    );
    expect(base.isBulkTransfer).toBe(false);
  });

  it("대량이체는 계좌정보가 불완전하면 포함되지 않는다", () => {
    const e = classifyRow(
      { 비용유형: "용역비", 대상자: "정프리", 세전지급액: 800000, 지급상태: "지급예정" },
      ctx()
    );
    expect(e.isBulkTransfer).toBe(false);
    expect(e.itemStatus).toBe("확인필요");
    expect(e.reviewReasons.length).toBeGreaterThan(0);
  });

  it("applyDefaultFlags는 카드 지출의 대량이체를 항상 끈다", () => {
    const entry = { costType: "신용카드", evidenceType: "신용카드", paymentStatus: "지급예정", isMonthEndPayment: true } as unknown as LedgerEntry;
    const out = applyDefaultFlags({ ...entry, bankName: "신한", accountNumber: "1", accountHolder: "x", netAmount: 100 } as LedgerEntry);
    expect(out.isBulkTransfer).toBe(false);
  });
});
