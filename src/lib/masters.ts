// 입력 줄이기 기능을 위한 마스터 데이터.
// 서버 저장 없이 localStorage에만 보관한다(복잡한 DB는 사용하지 않음).

import { LedgerEntry, PayeeMaster, ProjectAlias, RecurringTemplate } from "./types";

const KEYS = {
  payee: "settlement.payeeMaster",
  alias: "settlement.projectAlias",
  recurring: "settlement.recurring",
};

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ---- 지급대상자 마스터 ----------------------------------------------------

export function getPayeeMasters(): PayeeMaster[] {
  return load<PayeeMaster[]>(KEYS.payee, []);
}

export function upsertPayeeMaster(p: PayeeMaster): void {
  const list = getPayeeMasters();
  const idx = list.findIndex((x) => x.name === p.name);
  if (idx >= 0) list[idx] = p;
  else list.push(p);
  save(KEYS.payee, list);
}

/**
 * 대상자명으로 마스터를 찾아 계좌/증빙 기본값을 항목에 채운다.
 * 계좌정보가 기존과 다르면 reviewReasons에 확인 사유를 추가한다.
 */
export function applyPayeeMaster(entry: LedgerEntry): LedgerEntry {
  if (!entry.payeeName) return entry;
  const master = getPayeeMasters().find((m) => m.name === entry.payeeName);
  if (!master) return entry;

  const e = { ...entry, reviewReasons: [...entry.reviewReasons] };

  // 계좌정보가 비어 있으면 마스터에서 채운다.
  if (!e.bankName) e.bankName = master.bankName;
  if (!e.bankCode) e.bankCode = master.bankCode;
  if (!e.accountNumber) e.accountNumber = master.accountNumber;
  if (!e.accountHolder) e.accountHolder = master.accountHolder;

  // 채워져 있는데 마스터와 다르면 확인 필요.
  if (
    (entry.accountNumber && entry.accountNumber !== master.accountNumber) ||
    (entry.bankName && entry.bankName !== master.bankName)
  ) {
    e.reviewReasons.push("저장된 계좌정보와 달라요. 어느 쪽이 맞는지 확인해 주세요.");
  }
  return e;
}

// ---- 프로젝트/고객사 약칭 사전 --------------------------------------------

export function getProjectAliases(): ProjectAlias[] {
  return load<ProjectAlias[]>(KEYS.alias, []);
}

export function upsertProjectAlias(a: ProjectAlias): void {
  const list = getProjectAliases();
  const idx = list.findIndex((x) => x.canonicalProject === a.canonicalProject);
  if (idx >= 0) list[idx] = a;
  else list.push(a);
  save(KEYS.alias, list);
}

/**
 * 약칭 사전으로 프로젝트명을 표준명으로 매칭한다.
 * 정확/부분 일치만 자동 적용하고, 애매하면 매칭하지 않는다(확인 질문으로 처리).
 */
export function matchProjectAlias(raw: string): ProjectAlias | null {
  if (!raw) return null;
  const key = raw.replace(/\s+/g, "").toLowerCase();
  for (const a of getProjectAliases()) {
    const candidates = [a.canonicalProject, a.canonicalClient, ...a.aliases];
    for (const c of candidates) {
      const ck = c.replace(/\s+/g, "").toLowerCase();
      if (ck && (ck === key || key.includes(ck) || ck.includes(key))) return a;
    }
  }
  return null;
}

// ---- 이전 달 반복 항목 ----------------------------------------------------

export function getRecurringTemplates(): RecurringTemplate[] {
  return load<RecurringTemplate[]>(KEYS.recurring, []);
}

export function saveRecurringFromLedger(entries: LedgerEntry[]): void {
  // 반복 가능성이 높은 비용유형만 템플릿으로 저장한다.
  const recurringTypes = ["용역비", "강사비", "아르바이트비", "대여비"];
  const templates: RecurringTemplate[] = entries
    .filter((e) => recurringTypes.includes(e.costType) && e.payeeName)
    .map((e) => ({
      payeeName: e.payeeName,
      costType: e.costType,
      clientName: e.clientName,
      projectName: e.projectName,
      defaultPreTaxAmount: e.preTaxAmount,
      note: e.memo,
    }));
  // 대상자+비용유형 기준 중복 제거
  const seen = new Set<string>();
  const dedup = templates.filter((t) => {
    const k = `${t.payeeName}|${t.costType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  save(KEYS.recurring, dedup);
}
