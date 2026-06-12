import { describe, it, expect } from "vitest";
import { buildIncentiveStatements, projectCostBasis } from "./incentive";
import { LedgerEntry, ProjectInfo, RevenueReceipt } from "./types";
import { classifyRow } from "./classificationRules";

function ledgerEntry(over: Partial<LedgerEntry>): LedgerEntry {
  const base = classifyRow({ 대상자: "x", 비용유형: "기타", 금액: 0 }, {
    sourceFile: "t", sheetName: "s", rowIndex: 0,
    attributionMonth: "2026-03", paymentMonth: "2026-03", reportMonth: "2026-03", idSeq: 1,
  });
  return { ...base, isProjectCost: true, itemStatus: "승인완료", ...over };
}

function receipt(over: Partial<RevenueReceipt>): RevenueReceipt {
  return {
    id: "r1", receiptMonth: "2026-03", clientName: "한국자산관리공사", projectName: "P1",
    bankName: "신한은행", receiptDate: "2026-03-05", supplyAmount: 0, memo: "", confirmed: true, rawText: "",
    ...over,
  };
}

describe("성과 수당 계산", () => {
  it("수당명세서 예시: (수금 4,812,500 − 비용 891,100) × 5% = 196,070", () => {
    const receipts = [receipt({ supplyAmount: 4_812_500, projectName: "P1" })];
    const ledger = [
      ledgerEntry({ projectName: "P1", costType: "기타", totalAmount: 891_100, preTaxAmount: 891_100 }),
    ];
    const projects: ProjectInfo[] = [
      { id: "p1", projectName: "P1", clientName: "한국자산관리공사", educationName: "직무전문교육", assignments: [{ recipient: "홍길동", role: "운영" }] },
    ];
    const st = buildIncentiveStatements(receipts, ledger, projects, "2026-03");
    expect(st).toHaveLength(1);
    expect(st[0].recipient).toBe("홍길동");
    expect(st[0].lines[0].margin).toBe(3_921_400);
    expect(st[0].lines[0].incentive).toBe(196_070);
    expect(st[0].total).toBe(196_070);
  });

  it("제안서 작성은 10% 적용", () => {
    const st = buildIncentiveStatements(
      [receipt({ supplyAmount: 1_000_000, projectName: "P2" })],
      [],
      [{ id: "p2", projectName: "P2", clientName: "c", educationName: "", assignments: [{ recipient: "김", role: "제안서 작성" }] }],
      "2026-03"
    );
    expect(st[0].lines[0].incentive).toBe(100_000); // 1,000,000 × 10%
  });

  it("확인 안 된 수금은 계산에서 빠진다", () => {
    const st = buildIncentiveStatements(
      [receipt({ supplyAmount: 1_000_000, projectName: "P2", confirmed: false })],
      [],
      [{ id: "p2", projectName: "P2", clientName: "c", educationName: "", assignments: [{ recipient: "김", role: "운영" }] }],
      "2026-03"
    );
    expect(st).toHaveLength(0);
  });

  it("PM 미설정 프로젝트는 경고를 남기고 수당 0", () => {
    const st = buildIncentiveStatements(
      [receipt({ supplyAmount: 1_000_000, projectName: "PX" })],
      [],
      [],
      "2026-03"
    );
    expect(st[0].lines[0].incentive).toBe(0);
    expect(st[0].lines[0].warning).toBeTruthy();
  });

  it("세금계산서 비용은 공급가액만, 강사비는 세전 기준으로 잡는다", () => {
    const invoice = ledgerEntry({ costType: "세금계산서", supplyAmount: 500_000, vat: 50_000, totalAmount: 550_000 });
    expect(projectCostBasis(invoice)).toBe(500_000);
    const lecturer = ledgerEntry({ costType: "강사비", evidenceType: "사업소득 신고", preTaxAmount: 800_000, netAmount: 773_600 });
    expect(projectCostBasis(lecturer)).toBe(800_000);
  });
});
