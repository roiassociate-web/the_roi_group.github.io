import { describe, it, expect } from "vitest";
import { classifyRow, ClassifyContext } from "./classificationRules";

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

describe("주민/사업자번호 처리", () => {
  it("엑셀의 주민등록번호 컬럼을 자동 추출한다", () => {
    const e = classifyRow(
      { 비용유형: "강사비", 대상자: "김철수", 주민등록번호: "850101-1******", 세전지급액: 1000000,
        은행: "신한은행", 계좌번호: "110-1", 예금주: "김철수", 지급상태: "지급예정" },
      ctx()
    );
    expect(e.idOrBizNumber).toBe("850101-1******");
    // 번호가 있으면 해당 확인 사유가 없다
    expect(e.reviewReasons.some((r) => r.includes("주민/사업자번호"))).toBe(false);
  });

  it("원천세 대상인데 번호가 없으면 확인 필요 사유가 붙는다", () => {
    const e = classifyRow(
      { 비용유형: "용역비", 대상자: "정프리", 세전지급액: 800000, 지급상태: "지급예정" },
      ctx()
    );
    expect(e.isWithholding).toBe(true);
    expect(e.reviewReasons.some((r) => r.includes("주민/사업자번호"))).toBe(true);
    expect(e.itemStatus).toBe("확인필요");
  });

  it("원천세 비대상(세금계산서)은 번호가 없어도 사유가 붙지 않는다", () => {
    const e = classifyRow(
      { 비용유형: "세금계산서", 업체명: "(주)교재나라", 공급가액: 500000, 부가세: 50000, 지급상태: "지급예정",
        은행: "국민은행", 계좌번호: "012-1", 예금주: "(주)교재나라" },
      ctx()
    );
    expect(e.isWithholding).toBe(false);
    expect(e.reviewReasons.some((r) => r.includes("주민/사업자번호"))).toBe(false);
  });
});
