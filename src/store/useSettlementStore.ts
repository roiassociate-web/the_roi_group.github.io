// 앱 전역 상태 — 정산원장 항목과 검토 액션을 관리한다.
// 서버 저장 없이 메모리 + (선택) localStorage 마스터만 사용한다.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LedgerEntry, ItemStatus, RevisionLog } from "@/lib/types";
import { reclassify } from "@/lib/classificationRules";
import {
  enrichEntry,
  getRecurringTemplates,
  learnPayeeFromEntry,
  recurringToEntries,
  saveRecurringFromLedger,
  RECURRING_NOTE,
} from "@/lib/masters";

export type WizardStep =
  | "자료 넣기"
  | "자동 분류 확인"
  | "지급 목록 확인"
  | "대량이체 파일 생성"
  | "팀 보고 완료";

interface SettlementState {
  entries: LedgerEntry[];
  loadedFiles: string[];
  completedSteps: Record<WizardStep, boolean>;

  addEntries: (entries: LedgerEntry[], fileName?: string) => void;
  loadSample: (entries: LedgerEntry[]) => void;
  importRecurring: () => number;
  saveRecurring: () => number;
  reset: () => void;

  approve: (id: string) => void;
  bulkApproveHighConfidence: () => number;
  hold: (id: string) => void;
  exclude: (id: string) => void;
  edit: (id: string, patch: Partial<LedgerEntry>, reason?: string) => void;

  markStep: (step: WizardStep, done: boolean) => void;
}

const STEP_DEFAULT: Record<WizardStep, boolean> = {
  "자료 넣기": false,
  "자동 분류 확인": false,
  "지급 목록 확인": false,
  "대량이체 파일 생성": false,
  "팀 보고 완료": false,
};

/** 수정 시 변경된 필드들의 이력을 만든다. */
function diffRevisions(
  before: LedgerEntry,
  patch: Partial<LedgerEntry>,
  reason?: string
): RevisionLog[] {
  const at = new Date().toISOString();
  const logs: RevisionLog[] = [];
  for (const key of Object.keys(patch) as (keyof LedgerEntry)[]) {
    const b = before[key];
    const a = patch[key];
    if (String(b) !== String(a)) {
      logs.push({ at, field: String(key), before: String(b ?? ""), after: String(a ?? ""), reason });
    }
  }
  return logs;
}

// 서버 렌더(정적 export) 중에는 localStorage가 없으므로 안전한 no-op 저장소를 쓴다.
const safeStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
  return window.localStorage;
});

export const useSettlementStore = create<SettlementState>()(
  persist(
    (set, get) => ({
  entries: [],
  loadedFiles: [],
  completedSteps: { ...STEP_DEFAULT },

  addEntries: (incoming, fileName) =>
    set((state) => {
      // 업로드 시 지급대상자 마스터 + 약칭 사전을 자동 적용한다(입력 줄이기).
      const enriched = incoming.map((e) => enrichEntry(e));
      return {
        entries: [...state.entries, ...enriched],
        loadedFiles: fileName
          ? [...new Set([...state.loadedFiles, fileName])]
          : state.loadedFiles,
        completedSteps: { ...state.completedSteps, "자료 넣기": true },
      };
    }),

  loadSample: (entries) =>
    set((state) => ({
      entries: entries.map((e) => enrichEntry(e)),
      loadedFiles: [...new Set([...state.loadedFiles, "샘플데이터_5월.xlsx"])],
      completedSteps: { ...state.completedSteps, "자료 넣기": true },
    })),

  // 이전 달 반복 항목을 이번 달 후보로 불러온다.
  importRecurring: () => {
    const templates = getRecurringTemplates();
    if (templates.length === 0) return 0;
    const state = get();
    // 귀속월 기준: 이미 들어온 자료가 있으면 그 월을, 없으면 이번 달을 쓴다.
    const ym =
      state.entries[0]?.attributionMonth ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const enriched = recurringToEntries(templates, ym).map((e) =>
      enrichEntry(e, [RECURRING_NOTE])
    );
    set({
      entries: [...state.entries, ...enriched],
      completedSteps: { ...state.completedSteps, "자료 넣기": true },
    });
    return enriched.length;
  },

  // 현재 정산원장에서 반복 가능성 높은 항목을 다음 달용 템플릿으로 저장한다.
  saveRecurring: () => {
    const active = get().entries.filter(
      (e) => e.itemStatus !== "제외" && e.itemStatus !== "보류"
    );
    saveRecurringFromLedger(active);
    return getRecurringTemplates().length;
  },

  reset: () =>
    set({ entries: [], loadedFiles: [], completedSteps: { ...STEP_DEFAULT } }),

  approve: (id) =>
    set((state) => ({
      entries: state.entries.map((e) => {
        if (e.settlementId !== id) return e;
        // 승인된 정보는 지급대상자 마스터에 자동 학습한다(다음 달 자동 매핑).
        learnPayeeFromEntry(e);
        return { ...e, itemStatus: "승인완료" as ItemStatus };
      }),
    })),

  bulkApproveHighConfidence: () => {
    let count = 0;
    set((state) => ({
      entries: state.entries.map((e) => {
        const eligible =
          e.confidence === "높음" &&
          e.reviewReasons.length === 0 &&
          e.itemStatus !== "제외" &&
          e.itemStatus !== "보류" &&
          e.itemStatus !== "승인완료";
        if (eligible) {
          count++;
          learnPayeeFromEntry(e);
          return { ...e, itemStatus: "승인완료" as ItemStatus };
        }
        return e;
      }),
    }));
    return count;
  },

  hold: (id) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.settlementId === id ? { ...e, itemStatus: "보류" as ItemStatus } : e
      ),
    })),

  exclude: (id) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.settlementId === id ? { ...e, itemStatus: "제외" as ItemStatus } : e
      ),
    })),

  edit: (id, patch, reason) =>
    set((state) => ({
      entries: state.entries.map((e) => {
        if (e.settlementId !== id) return e;
        const revisions = [...e.revisions, ...diffRevisions(e, patch, reason)];
        // 수정 후 재분류(세금/플래그/사유/신뢰도 갱신).
        const merged = reclassify({ ...e, ...patch, revisions });
        // 확인 사유가 아직 남아 있으면 검토함에 계속 둔다(부분 수정 대응).
        const nextStatus: ItemStatus =
          merged.reviewReasons.length > 0 ? "확인필요" : "수정완료";
        // 정리 완료된 항목은 마스터에 자동 학습한다.
        if (nextStatus === "수정완료") learnPayeeFromEntry(merged);
        return { ...merged, itemStatus: nextStatus };
      }),
    })),

  markStep: (step, done) =>
    set((state) => ({
      completedSteps: { ...state.completedSteps, [step]: done },
    })),
    }),
    {
      name: "settlement-ledger", // localStorage 키
      storage: safeStorage,
      version: 3,
      // v1→v2: withholdingType 추가 / v2→v3: idOrBizNumber 추가.
      migrate: (persisted: unknown) => {
        const state = persisted as Partial<SettlementState> | undefined;
        if (state?.entries) {
          state.entries = state.entries.map((e) => ({
            ...e,
            withholdingType: e.withholdingType ?? "사업소득",
            idOrBizNumber: e.idOrBizNumber ?? "",
          }));
        }
        return state as SettlementState;
      },
      // 데이터(정산원장/넣은 자료/단계)만 저장한다. 액션 함수는 저장하지 않는다.
      partialize: (state) => ({
        entries: state.entries,
        loadedFiles: state.loadedFiles,
        completedSteps: state.completedSteps,
      }),
      // 서버/클라이언트 첫 렌더를 동일하게 맞추려고 자동 복원을 끄고,
      // 클라이언트 마운트 후 수동으로 rehydrate 한다(하이드레이션 불일치 방지).
      skipHydration: true,
    }
  )
);
