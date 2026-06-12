// 성과 수당(인센티브) 계산
//
// 핵심 공식 (수당명세서 양식 기준):
//   프로젝트별 수당 = ( 그 달 수금 공급가액 − 프로젝트 비용 ) × 비율
//   비율 = PM 역할 → 제안서 작성 10% / 운영 5%
//   비용 = 프로젝트비 + 강사비 + 기타 (정산원장에서 집계)
//   수당명세서 = 수령자(PM)별로, 이번 달 수금된 프로젝트들을 합산
//
// 지급은 다음 달 5일 급여로 나가며 정산 대량이체와는 별개다.

import { LedgerEntry, ProjectInfo, RevenueReceipt, ROLE_RATE, PmRole } from "./types";

function floorWon(n: number): number {
  return Math.floor(n);
}

function normName(s: string): string {
  return (s || "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 정산원장 항목 하나의 "프로젝트 비용" 기준 금액.
 * - 세금계산서: 공급가액만
 * - 사업소득/강사비/용역비/아르바이트비: 세전지급액
 * - 그 외(카드 등): 총금액
 */
export function projectCostBasis(e: LedgerEntry): number {
  if (e.costType === "세금계산서") return e.supplyAmount || e.totalAmount;
  if (
    e.evidenceType === "사업소득 신고" ||
    ["사업소득", "강사비", "용역비", "아르바이트비"].includes(e.costType)
  ) {
    return e.preTaxAmount;
  }
  return e.totalAmount || e.preTaxAmount;
}

/** 활성(제외/보류 아님) + 프로젝트비 반영 대상만 비용으로 집계한다. */
function isCostEntry(e: LedgerEntry): boolean {
  return e.itemStatus !== "제외" && e.itemStatus !== "보류" && e.isProjectCost;
}

export interface ProjectIncentiveLine {
  projectName: string;
  clientName: string;
  educationName: string;
  recipient: string;
  role: PmRole | "";
  rate: number; // 0.1 / 0.05 / 0
  revenue: number; // 수금 공급가액
  cost: number; // 프로젝트 비용
  margin: number; // 수금 − 비용
  incentive: number; // 산출 수당
  receiptDate: string;
  bankName: string;
  warning?: string; // PM/역할 미설정 등
}

export interface IncentiveStatement {
  recipient: string; // 수령자(직원)
  month: string; // 지급 기준 월(수금월)
  lines: ProjectIncentiveLine[];
  total: number; // 수당 지급액 합계
}

/** 프로젝트명으로 프로젝트 마스터를 찾는다(약칭/표준명 모두 비교). */
export function findProjectInfo(projects: ProjectInfo[], projectName: string): ProjectInfo | null {
  const key = normName(projectName);
  if (!key) return null;
  return (
    projects.find((p) => normName(p.projectName) === key) ??
    projects.find((p) => normName(p.projectName).includes(key) || key.includes(normName(p.projectName))) ??
    null
  );
}

/**
 * 이번 달 수금된 매출 + 정산원장 비용 + 프로젝트 마스터로
 * 수령자(PM)별 수당명세서를 만든다.
 */
export function buildIncentiveStatements(
  receipts: RevenueReceipt[],
  ledger: LedgerEntry[],
  projects: ProjectInfo[],
  month: string
): IncentiveStatement[] {
  // 1) 이번 달 + 확인된 수금만 프로젝트별로 합산
  const byProject = new Map<string, { revenue: number; clientName: string; receiptDate: string; bankName: string }>();
  for (const r of receipts) {
    if (r.receiptMonth !== month || !r.confirmed) continue;
    const key = normName(r.projectName);
    const cur = byProject.get(key) ?? { revenue: 0, clientName: r.clientName, receiptDate: r.receiptDate, bankName: r.bankName };
    cur.revenue += r.supplyAmount;
    cur.clientName = cur.clientName || r.clientName;
    cur.receiptDate = cur.receiptDate || r.receiptDate;
    cur.bankName = cur.bankName || r.bankName;
    byProject.set(key, cur);
  }

  // 2) 정산원장 비용을 프로젝트별로 합산
  const costByProject = new Map<string, number>();
  for (const e of ledger) {
    if (!isCostEntry(e) || !e.projectName) continue;
    const key = normName(e.projectName);
    costByProject.set(key, (costByProject.get(key) ?? 0) + projectCostBasis(e));
  }

  // 3) 프로젝트별 수당 라인 생성
  const lines: ProjectIncentiveLine[] = [];
  for (const [key, rev] of byProject) {
    const info = findProjectInfo(projects, prettyKey(receipts, key));
    const assignment = info?.assignments?.[0];
    const role = assignment?.role ?? "";
    const rate = role ? ROLE_RATE[role] : 0;
    const cost = costByProject.get(key) ?? 0;
    const margin = rev.revenue - cost;
    const incentive = role ? Math.max(0, floorWon(margin * rate)) : 0;
    lines.push({
      projectName: info?.projectName ?? prettyKey(receipts, key),
      clientName: info?.clientName || rev.clientName,
      educationName: info?.educationName ?? "",
      recipient: assignment?.recipient ?? "",
      role,
      rate,
      revenue: rev.revenue,
      cost,
      margin,
      incentive,
      receiptDate: rev.receiptDate,
      bankName: rev.bankName,
      warning: !info
        ? "프로젝트 설정(PM·역할)이 없어요."
        : !assignment
          ? "이 프로젝트에 PM·역할이 지정되지 않았어요."
          : undefined,
    });
  }

  // 4) 수령자별로 묶어 명세서로 만든다 (PM 미지정은 '(미지정)'으로 모음)
  const byRecipient = new Map<string, ProjectIncentiveLine[]>();
  for (const line of lines) {
    const key = line.recipient || "(PM 미지정)";
    const arr = byRecipient.get(key) ?? [];
    arr.push(line);
    byRecipient.set(key, arr);
  }

  return Array.from(byRecipient.entries()).map(([recipient, ls]) => ({
    recipient,
    month,
    lines: ls,
    total: ls.reduce((s, l) => s + l.incentive, 0),
  }));
}

/** 마스터에 없을 때 원본 수금의 프로젝트명을 그대로 보여주기 위한 헬퍼. */
function prettyKey(receipts: RevenueReceipt[], key: string): string {
  const r = receipts.find((x) => normName(x.projectName) === key);
  return r?.projectName ?? key;
}
