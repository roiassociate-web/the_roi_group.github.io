import { describe, it, expect, beforeEach } from "vitest";
import { classifyRow, ClassifyContext } from "./classificationRules";
import {
  upsertPayeeMaster,
  getPayeeMasters,
  findPayeeMaster,
  findPayeeMasterMatches,
  findPayeeMasterByNumber,
  applyPayeeMaster,
  learnPayeeFromEntry,
} from "./masters";
import { LedgerEntry } from "./types";

// node 테스트 환경에 localStorage가 없으므로 간단한 메모리 목을 깐다.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

function makeEntry(over: Partial<LedgerEntry>): LedgerEntry {
  const base = classifyRow({ 대상자: "x", 비용유형: "강사비", 세전지급액: 1000 }, {
    sourceFile: "t", sheetName: "s", rowIndex: 0,
    attributionMonth: "2026-05", paymentMonth: "2026-05", reportMonth: "2026-05", idSeq: 1,
  });
  return { ...base, reviewReasons: [], ...over };
}

const MASTER = {
  partyType: "개인" as const,
  bankCode: "088",
  accountHolder: "김철수",
  defaultEvidence: "사업소득 신고" as const,
  defaultWithholding: true,
};

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

describe("동명이인 처리 (지급처 DB)", () => {
  it("같은 이름이라도 번호가 다르면 별개 마스터로 저장된다", () => {
    upsertPayeeMaster({ ...MASTER, name: "김철수", bankName: "신한은행", accountNumber: "110-1", idOrBizNumber: "850101-1000000" });
    upsertPayeeMaster({ ...MASTER, name: "김철수", bankName: "국민은행", accountNumber: "012-2", idOrBizNumber: "900202-2000000" });
    expect(getPayeeMasters()).toHaveLength(2);
    expect(findPayeeMasterMatches("김철수")).toHaveLength(2);
  });

  it("번호가 있으면 동명이인 중에서도 정확히 매칭된다", () => {
    upsertPayeeMaster({ ...MASTER, name: "김철수", bankName: "신한은행", accountNumber: "110-1", idOrBizNumber: "850101-1000000" });
    upsertPayeeMaster({ ...MASTER, name: "김철수", bankName: "국민은행", accountNumber: "012-2", idOrBizNumber: "900202-2000000" });
    const m = findPayeeMasterByNumber("900202-2000000");
    expect(m?.bankName).toBe("국민은행");
    expect(findPayeeMaster({ payeeName: "김철수", idOrBizNumber: "850101-1000000" })?.bankName).toBe("신한은행");
  });

  it("번호 없이 동명이인이 여럿이면 자동 매핑하지 않고 확인 사유를 붙인다", () => {
    upsertPayeeMaster({ ...MASTER, name: "김철수", bankName: "신한은행", accountNumber: "110-1", idOrBizNumber: "850101-1000000" });
    upsertPayeeMaster({ ...MASTER, name: "김철수", bankName: "국민은행", accountNumber: "012-2", idOrBizNumber: "900202-2000000" });
    const e = applyPayeeMaster(makeEntry({ payeeName: "김철수", bankName: "", accountNumber: "" }));
    expect(e.bankName).toBe(""); // 자동으로 채우지 않음
    expect(e.reviewReasons.some((r) => r.includes("이름이 같은 대상자"))).toBe(true);
  });

  it("동명이인이 한 명뿐이면 자동으로 채운다", () => {
    upsertPayeeMaster({ ...MASTER, name: "박영희", bankName: "신한은행", accountNumber: "110-9", idOrBizNumber: "800303-2000000" });
    const e = applyPayeeMaster(makeEntry({ payeeName: "박영희", bankName: "", accountNumber: "" }));
    expect(e.bankName).toBe("신한은행");
    expect(e.accountNumber).toBe("110-9");
  });

  it("승인 학습은 같은 번호면 갱신, 새 번호면 동명이인으로 추가한다", () => {
    learnPayeeFromEntry(makeEntry({ payeeName: "이몽룡", bankName: "신한은행", accountNumber: "1", idOrBizNumber: "111111-1000000" }));
    learnPayeeFromEntry(makeEntry({ payeeName: "이몽룡", bankName: "국민은행", accountNumber: "2", idOrBizNumber: "222222-2000000" }));
    expect(findPayeeMasterMatches("이몽룡")).toHaveLength(2);
    // 같은 번호로 다시 학습하면 갱신만(개수 유지)
    learnPayeeFromEntry(makeEntry({ payeeName: "이몽룡", bankName: "하나은행", accountNumber: "3", idOrBizNumber: "111111-1000000" }));
    expect(findPayeeMasterMatches("이몽룡")).toHaveLength(2);
    expect(findPayeeMasterByNumber("111111-1000000")?.bankName).toBe("하나은행");
  });
});
