// 은행명 → 은행코드 매핑 (신한은행 대량이체 표준 코드표 기준)
// 대량이체 파일의 "*입금은행" 컬럼에는 이 코드를 넣는다.

export const BANK_CODES: Record<string, string> = {
  한국은행: "001",
  산업은행: "002",
  기업은행: "003",
  국민은행: "004",
  KB국민은행: "004",
  수협은행: "007",
  농협은행: "011",
  NH농협은행: "011",
  농협: "011",
  우리은행: "020",
  SC제일은행: "023",
  씨티은행: "027",
  대구은행: "031",
  부산은행: "032",
  광주은행: "034",
  제주은행: "035",
  전북은행: "037",
  경남은행: "039",
  새마을금고: "045",
  신협: "048",
  우체국: "071",
  하나은행: "081",
  KEB하나은행: "081",
  신한은행: "088",
  신한: "088",
  카카오뱅크: "090",
  케이뱅크: "089",
  토스뱅크: "092",
};

/** 은행명에서 공백/특수문자를 제거해 표준화한다. */
function normalizeBankName(name: string): string {
  return name.replace(/\s+/g, "").replace(/[()]/g, "");
}

/**
 * 은행명을 은행코드로 변환한다.
 * 코드표에 없으면 빈 문자열을 반환한다(확인 필요 신호).
 */
export function bankNameToCode(bankName: string): string {
  if (!bankName) return "";
  const key = normalizeBankName(bankName);
  if (BANK_CODES[key]) return BANK_CODES[key];
  // 부분 일치 시도 (예: "신한은행(보통)")
  for (const [name, code] of Object.entries(BANK_CODES)) {
    if (key.includes(name) || name.includes(key)) return code;
  }
  return "";
}

/** 코드표에 존재하는 은행명인지 확인한다. */
export function isKnownBank(bankName: string): boolean {
  return bankNameToCode(bankName) !== "";
}
