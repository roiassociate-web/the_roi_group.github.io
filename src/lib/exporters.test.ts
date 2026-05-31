import { describe, it, expect } from "vitest";
import { buildBulkTransferRows, BULK_TRANSFER_HEADERS } from "./exporters";
import { buildSampleEntries } from "./sampleData";
import { selectBulkTransfer, selectWithholding } from "./selectors";
import { guessMonthFromFileName } from "./parseFiles";

describe("신한은행 대량이체 출력", () => {
  it("컬럼 순서가 사양과 일치한다", () => {
    expect(BULK_TRANSFER_HEADERS).toEqual([
      "*입금은행", "*입금계좌", "고객관리성명", "*입금액",
      "출금통장표시내용", "입금통장표시내용", "입금인코드", "비고",
    ]);
  });

  it("샘플 데이터에서 대량이체 대상은 지급예정+계좌완비 항목만 포함된다", () => {
    const entries = buildSampleEntries();
    const rows = buildBulkTransferRows(entries);
    // 강사비 김철수(개인) + 세금계산서 미지급 업체 = 2건. 카드/지급완료/계좌누락은 제외.
    expect(rows.length).toBe(2);

    const kim = rows.find((r) => r["고객관리성명"] === "김철수");
    expect(kim).toBeDefined();
    expect(kim!["*입금은행"]).toBe("088"); // 신한
    // 사업소득 강사비는 세전이 아니라 실지급액(967,000)이 들어간다
    expect(kim!["*입금액"]).toBe(967_000);
    expect(kim!["입금인코드"]).toBe("");

    // 세금계산서 업체는 부가세 포함 총금액(550,000)으로 지급
    const vendor = rows.find((r) => r["고객관리성명"] === "(주)교재나라");
    expect(vendor).toBeDefined();
    expect(vendor!["*입금액"]).toBe(550_000);
  });

  it("신용카드/지급완료 항목은 대량이체에서 제외된다", () => {
    const entries = buildSampleEntries();
    const bulk = selectBulkTransfer(entries);
    expect(bulk.some((e) => e.costType === "신용카드")).toBe(false);
    expect(bulk.some((e) => e.paymentStatus === "지급완료")).toBe(false);
  });

  it("세금계산서 업체 비용은 원천세 신고자료에서 제외된다", () => {
    const entries = buildSampleEntries();
    const wh = selectWithholding(entries);
    expect(wh.some((e) => e.costType === "세금계산서")).toBe(false);
  });
});

describe("파일명 기반 월 인식", () => {
  it("'수당명세서_6월.xlsx'에서 6월을 인식한다", () => {
    const g = guessMonthFromFileName("수당명세서_6월.xlsx", new Date("2026-06-15"));
    expect(g.paymentMonth).toBe("2026-06");
    expect(g.detectedFromName).toBe(true);
  });

  it("'2026-03 정산.xlsx'에서 연·월을 인식한다", () => {
    const g = guessMonthFromFileName("2026-03 정산.xlsx");
    expect(g.attributionMonth).toBe("2026-03");
  });
});
