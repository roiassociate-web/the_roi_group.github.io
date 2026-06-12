import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildIncentiveStatements, projectCostBasis } from "./incentive";
import { parseDepositFile } from "./parseFiles";
import { LedgerEntry, ProjectInfo, RevenueReceipt } from "./types";
import { classifyRow } from "./classificationRules";

// 신한은행 입금내역 형식의 가짜 파일을 만든다.
function makeDepositFile(rows: Record<string, unknown>[]): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "내역");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], "신한_입금내역_3월.xlsx");
}

describe("신한은행 입금내역 파서", () => {
  const headers = (over: Record<string, unknown>) => ({
    No: 1, 전체선택: "", 거래일시: "2026-03-05 14:23:01", 적요: "", 입금액: "",
    출금액: "", 내용: "", 잔액: "10000000", 거래점명: "본점", 입금인코드: "0001", 메모: "",
    ...over,
  });

  it("입금액 행만 잡고 출금 행은 무시한다 (입금인코드를 금액으로 오인하지 않음)", async () => {
    const file = makeDepositFile([
      headers({ 입금액: "4,812,500", 내용: "한국자산관리공사", 입금인코드: "9999" }),
      headers({ 출금액: "500,000", 내용: "임대료" }),
    ]);
    const receipts = await parseDepositFile(file);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].supplyAmount).toBe(4_812_500);
    expect(receipts[0].receiptDate).toBe("2026-03-05");
    expect(receipts[0].rawText).toContain("한국자산관리공사");
    expect(receipts[0].excluded).toBe(false);
  });

  it("환불 입금(카카오·쿠팡·KTX)은 제외로 표시한다", async () => {
    const file = makeDepositFile([
      headers({ 입금액: "30,000", 내용: "카카오페이 환불" }),
      headers({ 입금액: "12,000", 내용: "쿠팡" }),
      headers({ 입금액: "47,000", 내용: "코레일 KTX 취소" }),
      headers({ 입금액: "5,000,000", 내용: "삼송전자" }),
    ]);
    const receipts = await parseDepositFile(file);
    expect(receipts).toHaveLength(4);
    const excluded = receipts.filter((r) => r.excluded);
    expect(excluded).toHaveLength(3); // 카카오/쿠팡/KTX
    const real = receipts.find((r) => !r.excluded);
    expect(real?.supplyAmount).toBe(5_000_000);
  });

  it("환불로 제외된 수금은 수당 계산에 들어가지 않는다", () => {
    const st = buildIncentiveStatements(
      [
        receipt({ supplyAmount: 1_000_000, projectName: "P2", excluded: true, excludeReason: "환불" }),
      ],
      [],
      [{ id: "p2", projectName: "P2", clientName: "c", educationName: "", assignments: [{ recipient: "김", role: "운영" }] }],
      "2026-03"
    );
    expect(st).toHaveLength(0);
  });
});

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
    excluded: false, excludeReason: "",
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
