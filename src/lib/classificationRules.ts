// 자동 분류 규칙
//
// 이 파일은 "기준"을 한 곳에 모아 나중에 쉽게 고칠 수 있도록 분리했다.
// 컴포넌트나 파싱 로직은 여기 규칙을 호출만 한다.
//
// 핵심: 앱이 기본값을 먼저 적용하고, 사용자는 예외만 확인한다.

import {
  CostType,
  EvidenceType,
  LedgerEntry,
  PartyType,
  PaymentMethod,
  PaymentStatus,
  Confidence,
} from "./types";
import { calcTaxFromPreTax } from "./taxCalc";
import { bankNameToCode, isKnownBank } from "./bankCodes";

// ---------------------------------------------------------------------------
// 1) 키워드 사전 — 컬럼명/항목명/메모에서 비용유형을 추론한다.
// ---------------------------------------------------------------------------

const COST_TYPE_KEYWORDS: { type: CostType; keywords: string[] }[] = [
  { type: "신용카드", keywords: ["카드", "card", "법인카드", "신용카드", "결제"] },
  { type: "세금계산서", keywords: ["세금계산서", "계산서", "tax invoice", "발행", "공급가"] },
  { type: "강사비", keywords: ["강사", "강의", "강사료", "강사비"] },
  { type: "용역비", keywords: ["용역", "외주", "프리랜서", "용역비"] },
  { type: "아르바이트비", keywords: ["알바", "아르바이트", "단기", "일용"] },
  { type: "교재비", keywords: ["교재", "교재비", "도서", "인쇄"] },
  { type: "현수막 제작비", keywords: ["현수막", "배너", "제작비"] },
  { type: "대관비", keywords: ["대관", "장소", "회의실", "강의실"] },
  { type: "대여비", keywords: ["대여", "렌탈", "임대", "리스"] },
  { type: "실비", keywords: ["실비", "교통", "출장", "식대", "택시", "주차"] },
  { type: "직원 성과수당", keywords: ["성과", "수당", "인센티브", "상여"] },
  { type: "사업소득", keywords: ["사업소득", "3.3", "원천", "프리"] },
];

// 개인으로 추정되는 비용유형
const PERSON_COST_TYPES: CostType[] = ["강사비", "용역비", "아르바이트비", "사업소득"];

// ---------------------------------------------------------------------------
// 2) 셀 값 추출 유틸 — 다양한 컬럼명을 흡수한다.
// ---------------------------------------------------------------------------

type Cells = Record<string, string | number | null>;

function findCell(cells: Cells, candidates: string[]): string {
  const keys = Object.keys(cells);
  for (const cand of candidates) {
    for (const key of keys) {
      const nk = key.replace(/\s+/g, "").toLowerCase();
      const nc = cand.replace(/\s+/g, "").toLowerCase();
      if (nk.includes(nc)) {
        const v = cells[key];
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
    }
  }
  return "";
}

function findNumber(cells: Cells, candidates: string[]): number {
  const raw = findCell(cells, candidates);
  if (!raw) return 0;
  const n = Number(raw.replace(/[,\\₩원\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function joinAllText(cells: Cells): string {
  return [
    Object.keys(cells).join(" "),
    ...Object.values(cells).map((v) => (v == null ? "" : String(v))),
  ]
    .join(" ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// 3) 추론 함수들
// ---------------------------------------------------------------------------

export function inferCostType(haystack: string, fileName: string): CostType {
  const text = (haystack + " " + fileName).toLowerCase();
  for (const { type, keywords } of COST_TYPE_KEYWORDS) {
    if (keywords.some((k) => text.includes(k.toLowerCase()))) return type;
  }
  return "기타";
}

export function inferPartyType(costType: CostType, haystack: string): PartyType {
  const text = haystack.toLowerCase();
  if (text.includes("(주)") || text.includes("주식회사") || text.includes("㈜") || text.includes("법인"))
    return "업체";
  if (PERSON_COST_TYPES.includes(costType)) return "개인";
  if (costType === "세금계산서") return "업체";
  if (costType === "신용카드") return "업체";
  return "확인 필요";
}

export function inferEvidence(costType: CostType): EvidenceType {
  switch (costType) {
    case "신용카드":
      return "신용카드";
    case "세금계산서":
      return "세금계산서";
    case "사업소득":
    case "강사비":
    case "용역비":
    case "아르바이트비":
      return "사업소득 신고";
    case "직원 성과수당":
      return "내부정산";
    default:
      return "확인 필요";
  }
}

function inferPaymentStatus(haystack: string): PaymentStatus {
  const t = haystack;
  if (t.includes("지급완료") || t.includes("완료") || t.includes("이체완료")) return "지급완료";
  if (t.includes("보류") || t.includes("hold")) return "지급보류";
  if (t.includes("예정") || t.includes("미지급")) return "지급예정";
  return "확인 필요";
}

// ---------------------------------------------------------------------------
// 4) 자동 기본값 규칙 — 사양의 9개 규칙을 코드로 옮긴다.
//    엔트리의 분류 플래그(원천세/프로젝트비/월말지급/대량이체)를 채운다.
// ---------------------------------------------------------------------------

export function applyDefaultFlags(entry: LedgerEntry): LedgerEntry {
  const e = { ...entry };
  const isCard = e.costType === "신용카드" || e.evidenceType === "신용카드";
  const isInvoice = e.costType === "세금계산서" || e.evidenceType === "세금계산서";
  const isBizIncome =
    e.evidenceType === "사업소득 신고" ||
    ["사업소득", "강사비", "용역비", "아르바이트비"].includes(e.costType);
  const isPersonService =
    e.partyType === "개인" &&
    ["강사비", "용역비", "아르바이트비"].includes(e.costType);

  // 규칙1: 신용카드 지출 → 프로젝트비 반영, 월말 지급/대량이체 제외
  if (isCard) {
    e.isProjectCost = true;
    e.isWithholding = false;
    e.isMonthEndPayment = false;
    e.isBulkTransfer = false;
    return finalizeBulkTransfer(e);
  }

  // 규칙2: 개인 강사비/용역비/아르바이트비 → 원천세 + 월말 지급 대상
  if (isPersonService) {
    e.isWithholding = true;
    e.isMonthEndPayment = true;
  }

  // 규칙3: 사업소득 신고 대상 → 원천세자료 + 프로젝트비 + 월말 지급 목록 반영
  if (isBizIncome) {
    e.isWithholding = true;
    e.isProjectCost = true;
    e.isMonthEndPayment = true;
  }

  // 규칙5: 세금계산서 발행 업체 비용 → 원천세 신고자료 제외
  if (isInvoice) {
    e.isWithholding = false;
    e.isProjectCost = true;
    // 규칙6: 미지급 상태이면 월말 지급 예정 목록 포함
    e.isMonthEndPayment = e.paymentStatus !== "지급완료";
  }

  return finalizeBulkTransfer(e);
}

/**
 * 대량이체 포함 여부를 조건에 따라 최종 결정한다 (규칙4,7,8 + 대량이체 포함/제외 조건).
 */
function finalizeBulkTransfer(entry: LedgerEntry): LedgerEntry {
  const e = { ...entry };
  const isCard = e.costType === "신용카드" || e.evidenceType === "신용카드";
  const payAmount = e.netAmount || e.preTaxAmount || e.totalAmount;

  const include =
    !isCard && // 신용카드 지출 제외
    e.paymentStatus === "지급예정" && // 지급예정만
    (e.paymentMethod === "계좌이체" || e.paymentMethod === "대량이체" || e.paymentMethod === "확인 필요") &&
    e.isMonthEndPayment && // 월말 지급 대상
    !!e.bankName &&
    !!e.accountNumber &&
    !!e.accountHolder &&
    payAmount > 0;

  e.isBulkTransfer = include;
  return e;
}

// ---------------------------------------------------------------------------
// 5) 확인필요 사유 + 신뢰도 계산
// ---------------------------------------------------------------------------

export function computeReviewReasons(entry: LedgerEntry): string[] {
  const reasons: string[] = [];
  const amount = entry.netAmount || entry.preTaxAmount || entry.totalAmount;

  if (entry.partyType === "확인 필요")
    reasons.push("개인에게 지급하는지 업체에게 지급하는지 확인이 필요해요.");
  if (entry.evidenceType === "확인 필요")
    reasons.push("증빙방식을 어떻게 처리할지 확인이 필요해요.");
  if (entry.paymentStatus === "확인 필요")
    reasons.push("지급 완료인지 지급 예정인지 확인이 필요해요.");
  if (!entry.payeeName) reasons.push("대상자 또는 업체명이 비어 있어요.");
  if (!entry.projectName) reasons.push("어느 프로젝트에 귀속되는지 확인이 필요해요.");
  if (amount <= 0) reasons.push("금액이 비어 있거나 0원이에요.");

  // 대량이체 대상인데 계좌정보가 부족한 경우
  if (entry.isMonthEndPayment && entry.paymentStatus === "지급예정") {
    if (!entry.bankName) reasons.push("은행명이 비어 있어요.");
    else if (!isKnownBank(entry.bankName)) reasons.push("은행명이 코드표와 맞지 않아요.");
    if (!entry.accountNumber) reasons.push("계좌번호가 비어 있어요.");
    if (!entry.accountHolder) reasons.push("예금주가 비어 있어요.");
  }

  return reasons;
}

export function computeConfidence(entry: LedgerEntry, reasons: string[]): Confidence {
  if (reasons.length === 0 && entry.costType !== "기타") return "높음";
  if (reasons.length >= 3 || entry.costType === "기타") return "낮음";
  return "중간";
}

/** 필수값이 충분해 승인 가능한지 (규칙9). */
export function isApprovable(entry: LedgerEntry): boolean {
  const amount = entry.netAmount || entry.preTaxAmount || entry.totalAmount;
  if (!entry.payeeName || amount <= 0) return false;
  if (entry.partyType === "확인 필요") return false;
  if (entry.evidenceType === "확인 필요") return false;
  // 대량이체 대상이면 계좌정보 필수
  if (entry.isBulkTransfer) {
    if (!entry.bankName || !entry.accountNumber || !entry.accountHolder) return false;
    if (!isKnownBank(entry.bankName)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 6) 통합 파이프라인 — 셀 + 컨텍스트 → 분류된 LedgerEntry
// ---------------------------------------------------------------------------

export interface ClassifyContext {
  sourceFile: string;
  sheetName: string;
  rowIndex: number;
  attributionMonth: string;
  paymentMonth: string;
  reportMonth: string;
  idSeq: number;
}

export function classifyRow(cells: Cells, ctx: ClassifyContext): LedgerEntry {
  const haystack = joinAllText(cells);

  const payeeName = findCell(cells, ["대상자", "업체명", "성명", "이름", "거래처", "지급처", "수취인"]);
  const clientName = findCell(cells, ["고객사", "거래처", "client", "발주"]);
  const projectName = findCell(cells, ["프로젝트", "과정", "사업명", "project"]);
  const manager = findCell(cells, ["담당자", "담당", "manager"]);
  const memo = findCell(cells, ["메모", "비고", "내용", "적요", "note"]);

  const bankName = findCell(cells, ["은행", "bank"]);
  const accountNumber = findCell(cells, ["계좌", "account"]);
  const accountHolder = findCell(cells, ["예금주", "holder"]) || payeeName;

  const costType = inferCostType(haystack, ctx.sourceFile);
  const partyType = inferPartyType(costType, haystack + " " + payeeName);
  const evidenceType = inferEvidence(costType);
  const paymentStatus = inferPaymentStatus(haystack);

  // 금액: 세전/공급가/총액/지급액 중 잡히는 것을 사용
  const supplyAmount = findNumber(cells, ["공급가", "공급가액"]);
  const vat = findNumber(cells, ["부가세", "vat", "세액"]);
  const explicitTotal = findNumber(cells, ["총금액", "합계", "금액", "지급액", "amount"]);
  const preTaxRaw = findNumber(cells, ["세전", "지급예정액", "지급액"]);

  const totalAmount = explicitTotal || supplyAmount + vat;
  let preTaxAmount = preTaxRaw || supplyAmount || totalAmount;

  // 사업소득 계열이면 세전 기준으로 세금 자동 계산
  const isBizIncome =
    evidenceType === "사업소득 신고" ||
    ["사업소득", "강사비", "용역비", "아르바이트비"].includes(costType);

  // 원천징수 유형은 기본 사업소득(3.3%). 기타소득은 사용자가 수정에서 선택한다.
  const withholdingType: LedgerEntry["withholdingType"] = "사업소득";

  let withholdingTax = 0;
  let residentTax = 0;
  let netAmount = preTaxAmount;
  if (isBizIncome && preTaxAmount > 0) {
    const t = calcTaxFromPreTax(preTaxAmount, withholdingType);
    preTaxAmount = t.preTaxAmount;
    withholdingTax = t.withholdingTax;
    residentTax = t.residentTax;
    netAmount = t.netAmount;
  }

  const base: LedgerEntry = {
    settlementId: `S-${ctx.attributionMonth}-${String(ctx.idSeq).padStart(4, "0")}`,
    attributionMonth: ctx.attributionMonth,
    paymentMonth: ctx.paymentMonth,
    reportMonth: ctx.reportMonth,
    clientName,
    projectName,
    payeeName,
    partyType,
    costType,
    evidenceType,
    isWithholding: false,
    withholdingType,
    isProjectCost: false,
    isMonthEndPayment: false,
    isBulkTransfer: false,
    paymentStatus,
    paymentMethod: bankName && accountNumber ? "계좌이체" : "확인 필요",
    supplyAmount,
    vat,
    totalAmount,
    preTaxAmount,
    withholdingTax,
    residentTax,
    netAmount,
    paymentDate: "",
    bankName,
    bankCode: bankNameToCode(bankName),
    accountNumber,
    accountHolder,
    manager,
    memo,
    itemStatus: "자동분류됨",
    confidence: "중간",
    reviewReasons: [],
    revisions: [],
  };

  const withFlags = applyDefaultFlags(base);
  const reasons = computeReviewReasons(withFlags);
  const confidence = computeConfidence(withFlags, reasons);

  return {
    ...withFlags,
    reviewReasons: reasons,
    confidence,
    itemStatus: reasons.length > 0 ? "확인필요" : "자동분류됨",
  };
}

/**
 * 사용자가 일부 필드를 수정한 뒤 재분류한다(세금/플래그/사유/신뢰도 갱신).
 * taxManualOverride가 true면 세금은 건드리지 않는다.
 */
export function reclassify(entry: LedgerEntry): LedgerEntry {
  let e = { ...entry };
  const isBizIncome =
    e.evidenceType === "사업소득 신고" ||
    ["사업소득", "강사비", "용역비", "아르바이트비"].includes(e.costType);

  if (!e.withholdingType) e.withholdingType = "사업소득"; // 과거 데이터 호환
  if (isBizIncome && !e.taxManualOverride && e.preTaxAmount > 0) {
    const t = calcTaxFromPreTax(e.preTaxAmount, e.withholdingType);
    e.withholdingTax = t.withholdingTax;
    e.residentTax = t.residentTax;
    e.netAmount = t.netAmount;
  }
  e.bankCode = bankNameToCode(e.bankName);
  e = applyDefaultFlags(e);
  const reasons = computeReviewReasons(e);
  e.reviewReasons = reasons;
  e.confidence = computeConfidence(e, reasons);
  return e;
}
