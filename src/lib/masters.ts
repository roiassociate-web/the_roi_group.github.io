// 입력 줄이기 기능을 위한 마스터 데이터.
// 서버 저장 없이 localStorage에만 보관한다(복잡한 DB는 사용하지 않음).

import { LedgerEntry, ItemStatus, PayeeMaster, ProjectAlias, RecurringTemplate } from "./types";
import { classifyRow, reclassify, computeConfidence } from "./classificationRules";

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

// ---- 지급대상자 마스터 (지급처 간단 DB) ------------------------------------

function norm(s: string): string {
  return (s || "").replace(/\s+/g, "").toLowerCase();
}

function genId(): string {
  return `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 주민/사업자번호에서 구분자를 떼고 비교용으로 정규화. */
function normNum(s: string): string {
  return (s || "").replace(/[^0-9*]/g, "");
}

export function getPayeeMasters(): PayeeMaster[] {
  // 과거 데이터에 id/aliases가 없을 수 있으므로 읽을 때 보강한다.
  let changed = false;
  const list = load<PayeeMaster[]>(KEYS.payee, []).map((m) => {
    const fixed = { ...m, aliases: m.aliases ?? [] };
    if (!fixed.id) {
      fixed.id = genId();
      changed = true;
    }
    return fixed;
  });
  if (changed) save(KEYS.payee, list);
  return list;
}

export function upsertPayeeMaster(p: PayeeMaster): void {
  const list = getPayeeMasters();
  // id가 있으면 id로, 없으면 같은 번호 → (번호 없으면) 같은 이름+계좌 로 찾는다.
  const idx = p.id
    ? list.findIndex((x) => x.id === p.id)
    : list.findIndex(
        (x) =>
          (p.idOrBizNumber && normNum(x.idOrBizNumber) === normNum(p.idOrBizNumber)) ||
          (!p.idOrBizNumber && norm(x.name) === norm(p.name) && norm(x.accountNumber) === norm(p.accountNumber))
      );
  if (idx >= 0) list[idx] = { ...list[idx], ...p, id: list[idx].id };
  else list.push({ ...p, id: p.id ?? genId() });
  save(KEYS.payee, list);
}

export function removePayeeMaster(idOrName: string): void {
  save(
    KEYS.payee,
    getPayeeMasters().filter((x) => x.id !== idOrName && x.name !== idOrName)
  );
}

/** 이름·별칭·예금주가 일치하는 모든 마스터를 찾는다(동명이인 포함). */
export function findPayeeMasterMatches(name: string): PayeeMaster[] {
  if (!name) return [];
  const key = norm(name);
  return getPayeeMasters().filter((m) =>
    [m.name, m.accountHolder, ...(m.aliases ?? [])].some((c) => norm(c) === key)
  );
}

/** 번호로 마스터를 찾는다(동명이인을 정확히 구분하는 진짜 키). */
export function findPayeeMasterByNumber(num: string): PayeeMaster | null {
  if (!num) return null;
  const key = normNum(num);
  return getPayeeMasters().find((m) => m.idOrBizNumber && normNum(m.idOrBizNumber) === key) ?? null;
}

/**
 * 항목을 명확히 식별하는 마스터를 고른다.
 * 1) 번호가 있으면 번호로 (동명이인이어도 정확)
 * 2) 번호가 없고 이름이 정확히 한 명만 매칭되면 그 한 명
 * 3) 동명이인이 여럿이면 null(자동 적용하지 않고 사용자에게 묻는다)
 */
export function findPayeeMaster(entry: { payeeName: string; idOrBizNumber?: string }): PayeeMaster | null {
  if (entry.idOrBizNumber) {
    const byNum = findPayeeMasterByNumber(entry.idOrBizNumber);
    if (byNum) return byNum;
  }
  const matches = findPayeeMasterMatches(entry.payeeName);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * 정확히 일치하지 않을 때, 비슷한 마스터 후보를 추천한다(최초 매핑 질문용).
 * 포함 관계 정도만 본다 — 애매하면 사용자가 칩으로 선택한다.
 */
export function suggestPayeeMasters(name: string, limit = 3): PayeeMaster[] {
  if (!name) return [];
  const key = norm(name);
  if (findPayeeMasterMatches(name).length > 0) return [];
  return getPayeeMasters()
    .filter((m) => {
      const candidates = [m.name, m.accountHolder, ...(m.aliases ?? [])].map(norm);
      return candidates.some((c) => c && (c.includes(key) || key.includes(c)));
    })
    .slice(0, limit);
}

/**
 * "이 이름은 이 마스터다"라고 한 번 매핑하면 별칭으로 저장한다.
 * 이후 같은 이름이 오면 자동 매핑된다. (마스터 id 기준)
 */
export function addPayeeAlias(masterId: string, alias: string): void {
  const list = getPayeeMasters();
  const m = list.find((x) => x.id === masterId);
  if (!m || !alias || norm(alias) === norm(m.name)) return;
  if (!(m.aliases ?? []).some((a) => norm(a) === norm(alias))) {
    m.aliases = [...(m.aliases ?? []), alias];
    save(KEYS.payee, list);
  }
}

/**
 * 항목을 승인/정리하면 그 정보를 마스터에 자동 학습한다.
 * 번호가 진짜 키이므로, 같은 이름이라도 번호가 다르면 별개(동명이인)로 저장한다.
 */
export function learnPayeeFromEntry(entry: LedgerEntry): void {
  if (!entry.payeeName) return;

  // 1) 번호가 있으면 번호로 식별 — 동명이인을 정확히 구분/생성한다.
  // 2) 번호가 없으면 이름이 유일하게 매칭될 때만 갱신, 아니면 새로 만들지 않는다(섞임 방지).
  let existing: PayeeMaster | null = null;
  if (entry.idOrBizNumber) {
    existing = findPayeeMasterByNumber(entry.idOrBizNumber);
  } else {
    const matches = findPayeeMasterMatches(entry.payeeName);
    existing = matches.length === 1 ? matches[0] : null;
    // 동명이인이 여럿이면 어느 쪽인지 확신할 수 없어 학습을 보류한다.
    if (matches.length > 1) return;
  }

  if (!existing) {
    if (!entry.accountNumber && !entry.idOrBizNumber) return; // 학습할 정보 없음
    upsertPayeeMaster({
      id: genId(),
      name: entry.payeeName,
      aliases: [],
      partyType: entry.partyType === "확인 필요" ? "개인" : entry.partyType,
      bankName: entry.bankName,
      bankCode: entry.bankCode,
      accountNumber: entry.accountNumber,
      accountHolder: entry.accountHolder || entry.payeeName,
      idOrBizNumber: entry.idOrBizNumber,
      defaultEvidence: entry.evidenceType,
      defaultWithholding: entry.isWithholding,
      defaultWithholdingType: entry.withholdingType,
    });
    return;
  }
  upsertPayeeMaster({
    ...existing,
    bankName: entry.bankName || existing.bankName,
    bankCode: entry.bankCode || existing.bankCode,
    accountNumber: entry.accountNumber || existing.accountNumber,
    accountHolder: entry.accountHolder || existing.accountHolder,
    idOrBizNumber: entry.idOrBizNumber || existing.idOrBizNumber,
    partyType: entry.partyType !== "확인 필요" ? entry.partyType : existing.partyType,
    defaultWithholdingType: entry.withholdingType || existing.defaultWithholdingType,
  });
}

/**
 * 마스터를 항목에 자동 적용한다(자동 매핑).
 * 동명이인이 여럿이면 자동 적용하지 않고 확인 사유를 남긴다.
 */
export function applyPayeeMaster(entry: LedgerEntry): LedgerEntry {
  // 동명이인 여럿 + 번호로 특정 불가 → 자동 매핑하지 않고 확인 요청.
  const ambiguous =
    !entry.idOrBizNumber && findPayeeMasterMatches(entry.payeeName).length > 1;
  if (ambiguous) {
    return {
      ...entry,
      reviewReasons: [
        ...entry.reviewReasons,
        "이름이 같은 대상자가 여러 명 있어요. 어느 분인지 확인해 주세요.",
      ],
    };
  }

  const master = findPayeeMaster(entry);
  if (!master) return entry;

  const e = { ...entry, reviewReasons: [...entry.reviewReasons] };

  // 비어 있는 정보는 마스터에서 채운다.
  if (!e.bankName) e.bankName = master.bankName;
  if (!e.bankCode) e.bankCode = master.bankCode;
  if (!e.accountNumber) e.accountNumber = master.accountNumber;
  if (!e.accountHolder) e.accountHolder = master.accountHolder;
  if (!e.idOrBizNumber) e.idOrBizNumber = master.idOrBizNumber;

  // 분류 기본값: 항목 쪽이 "확인 필요"일 때만 마스터 값을 쓴다.
  if (e.partyType === "확인 필요") e.partyType = master.partyType;
  if (e.evidenceType === "확인 필요" && master.defaultEvidence !== "확인 필요") {
    e.evidenceType = master.defaultEvidence;
  }
  if (master.defaultWithholdingType) e.withholdingType = master.defaultWithholdingType;

  // 채워져 있는데 마스터와 다르면 확인 필요.
  if (
    (entry.accountNumber && master.accountNumber && entry.accountNumber !== master.accountNumber) ||
    (entry.bankName && master.bankName && entry.bankName !== master.bankName)
  ) {
    e.reviewReasons.push("저장된 계좌정보와 달라요. 어느 쪽이 맞는지 확인해 주세요.");
  }
  return e;
}

/**
 * 새로 들어온 항목을 한 번에 보강한다(자동 매핑 + 약칭 + 재분류).
 * 마스터/약칭이 추가한 안내 사유(계좌 불일치, 동명이인 등)는 재분류로
 * 지워지지 않도록 따로 보존해 다시 합친다.
 */
export function enrichEntry(entry: LedgerEntry, extraReasons: string[] = []): LedgerEntry {
  const before = entry.reviewReasons;
  const filled = applyPayeeMaster(applyProjectAlias(entry));
  // 마스터/약칭이 새로 붙인 안내 사유만 추려낸다.
  const advisory = [
    ...extraReasons,
    ...filled.reviewReasons.filter((r) => !before.includes(r)),
  ];
  const classified = reclassify(filled); // 플래그/세금/기본 사유 재계산
  const merged = [...classified.reviewReasons];
  for (const r of advisory) if (!merged.includes(r)) merged.push(r);
  return {
    ...classified,
    reviewReasons: merged,
    confidence: computeConfidence(classified, merged),
    itemStatus: (merged.length > 0 ? "확인필요" : "자동분류됨") as ItemStatus,
  };
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

export function removeProjectAlias(canonicalProject: string): void {
  save(KEYS.alias, getProjectAliases().filter((x) => x.canonicalProject !== canonicalProject));
}

/**
 * 약칭 사전을 적용해 고객사명/프로젝트명을 표준명으로 정규화한다.
 * 매칭이 되면 표준명으로 채우고, 원래 값이 표준과 달랐다면 확인 사유를 남긴다.
 */
export function applyProjectAlias(entry: LedgerEntry): LedgerEntry {
  const matched = matchProjectAlias(entry.projectName) || matchProjectAlias(entry.clientName);
  if (!matched) return entry;
  const e = { ...entry, reviewReasons: [...entry.reviewReasons] };
  if (matched.canonicalClient && !e.clientName) e.clientName = matched.canonicalClient;
  if (matched.canonicalProject) e.projectName = matched.canonicalProject;
  return e;
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

export function removeRecurringTemplate(payeeName: string, costType: string): void {
  save(
    KEYS.recurring,
    getRecurringTemplates().filter((t) => !(t.payeeName === payeeName && t.costType === costType))
  );
}

let RECUR_SEQ = 9000;

/**
 * 이전 달 반복 항목을 이번 달 후보로 변환한다.
 * 사용자는 금액·지급일·지급 여부만 확인하면 되도록 분류까지 마쳐 반환한다.
 */
export function recurringToEntries(
  templates: RecurringTemplate[],
  ym: string
): LedgerEntry[] {
  return templates.map((t) => {
    const cells: Record<string, string | number | null> = {
      대상자: t.payeeName,
      고객사: t.clientName,
      프로젝트: t.projectName,
      비용유형: t.costType,
      세전지급액: t.defaultPreTaxAmount,
      지급상태: "지급예정",
      메모: t.note ? `이전 달 반복 항목 · ${t.note}` : "이전 달 반복 항목",
    };
    // 반복 안내 사유는 enrichEntry에서 extraReasons로 붙인다(재분류로 지워지지 않도록).
    return classifyRow(cells, {
      sourceFile: "이전 달 반복 항목",
      sheetName: "반복",
      rowIndex: 0,
      attributionMonth: ym,
      paymentMonth: ym,
      reportMonth: ym,
      idSeq: RECUR_SEQ++,
    });
  });
}

/** 반복 항목 카드에 붙이는 안내 문구. */
export const RECURRING_NOTE = "이전 달 반복 항목이에요. 금액과 지급 여부만 확인해 주세요.";
