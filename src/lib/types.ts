// 월말 정산 체크룸 - 도메인 타입 정의
//
// 모든 데이터는 "정산원장(LedgerEntry)"을 기준으로 한다.
// 모든 출력물은 이 원장에서 파생된다.

/** 비용유형 */
export const COST_TYPES = [
  "신용카드",
  "세금계산서",
  "사업소득",
  "강사비",
  "용역비",
  "아르바이트비",
  "교재비",
  "현수막 제작비",
  "대관비",
  "대여비",
  "실비",
  "직원 성과수당",
  "기타",
] as const;
export type CostType = (typeof COST_TYPES)[number];

/** 증빙방식 */
export const EVIDENCE_TYPES = [
  "신용카드",
  "세금계산서",
  "사업소득 신고",
  "현금영수증",
  "내부정산",
  "확인 필요",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * 원천징수 유형. 공제율이 다르다.
 * - 사업소득: 3.3% (소득세 3% + 주민세 0.3%) — 일반적인 기본값
 * - 기타소득: 8.8% (소득세 8% + 주민세 0.8%)
 */
export const WITHHOLDING_TYPES = ["사업소득", "기타소득"] as const;
export type WithholdingType = (typeof WITHHOLDING_TYPES)[number];

/** 개인/업체 구분 */
export type PartyType = "개인" | "업체" | "확인 필요";

/** 지급상태 */
export type PaymentStatus = "지급예정" | "지급완료" | "지급보류" | "확인 필요";

/** 지급방법 */
export type PaymentMethod = "계좌이체" | "대량이체" | "카드결제" | "현금" | "확인 필요";

/** 처리상태 (검토함에서의 항목 상태) */
export type ItemStatus =
  | "자동분류됨"
  | "확인필요"
  | "승인완료"
  | "수정완료"
  | "보류"
  | "제외";

/** 신뢰도 */
export type Confidence = "높음" | "중간" | "낮음";

/** 수정 이력 항목 */
export interface RevisionLog {
  at: string; // ISO timestamp
  field: string;
  before: string;
  after: string;
  reason?: string;
}

/**
 * 정산원장 항목.
 * 자동 분류 후보부터 최종 승인 항목까지 동일한 형태를 사용한다.
 */
export interface LedgerEntry {
  // 식별/기간
  settlementId: string; // 정산ID
  attributionMonth: string; // 귀속월 (YYYY-MM)
  paymentMonth: string; // 지급월 (YYYY-MM)
  reportMonth: string; // 신고월 (YYYY-MM)

  // 대상
  clientName: string; // 고객사명
  projectName: string; // 프로젝트명
  payeeName: string; // 대상자명 또는 업체명
  partyType: PartyType; // 개인/업체 구분

  // 분류
  costType: CostType; // 비용유형
  evidenceType: EvidenceType; // 증빙방식
  isWithholding: boolean; // 원천세대상여부
  withholdingType: WithholdingType; // 원천징수 유형 (사업소득 3.3% / 기타소득 8.8%)
  isProjectCost: boolean; // 프로젝트비반영여부
  isMonthEndPayment: boolean; // 월말지급대상여부
  isBulkTransfer: boolean; // 대량이체포함여부

  // 지급
  paymentStatus: PaymentStatus; // 지급상태
  paymentMethod: PaymentMethod; // 지급방법

  // 금액
  supplyAmount: number; // 공급가액
  vat: number; // 부가세
  totalAmount: number; // 총금액
  preTaxAmount: number; // 세전지급액
  withholdingTax: number; // 원천세
  residentTax: number; // 주민세
  netAmount: number; // 실지급액

  // 계좌/담당
  paymentDate: string; // 지급일 (YYYY-MM-DD)
  bankName: string; // 은행명
  bankCode: string; // 은행코드
  accountNumber: string; // 계좌번호
  accountHolder: string; // 예금주
  manager: string; // 담당자
  memo: string; // 메모

  // 메타
  itemStatus: ItemStatus; // 처리상태
  confidence: Confidence; // 신뢰도
  reviewReasons: string[]; // 확인필요사유
  revisions: RevisionLog[]; // 수정이력

  // 세금 수동 수정 여부 (true면 자동 재계산을 멈춘다)
  taxManualOverride?: boolean;
}

/** 파일에서 읽어들인 원시 행 (분류 전 후보의 원천) */
export interface RawRow {
  sourceFile: string;
  sheetName: string;
  rowIndex: number;
  cells: Record<string, string | number | null>;
}

/** 지급대상자 마스터 */
export interface PayeeMaster {
  name: string; // 성명 또는 업체명
  partyType: PartyType;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
  idOrBizNumber: string; // 주민등록번호 또는 사업자등록번호
  defaultEvidence: EvidenceType;
  defaultWithholding: boolean;
}

/** 프로젝트/고객사 약칭 사전 */
export interface ProjectAlias {
  canonicalClient: string; // 표준 고객사명
  canonicalProject: string; // 표준 프로젝트명
  aliases: string[]; // 약칭 후보들
}

/** 이전 달 반복 항목 (이번 달 후보 추천용) */
export interface RecurringTemplate {
  payeeName: string;
  costType: CostType;
  clientName: string;
  projectName: string;
  defaultPreTaxAmount: number;
  note: string;
}
