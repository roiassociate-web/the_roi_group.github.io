// 앱 전역 상태 — 정산원장 항목과 검토 액션을 관리한다.
// 서버 저장 없이 메모리 + (선택) localStorage 마스터만 사용한다.

import { create } from "zustand";
import { LedgerEntry, ItemStatus, RevisionLog } from "@/lib/types";
import { reclassify } from "@/lib/classificationRules";
import { applyPayeeMaster } from "@/lib/masters";

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

export const useSettlementStore = create<SettlementState>((set, get) => ({
  entries: [],
  loadedFiles: [],
  completedSteps: { ...STEP_DEFAULT },

  addEntries: (incoming, fileName) =>
    set((state) => {
      // 업로드 시 지급대상자 마스터 정보를 자동으로 채운다(입력 줄이기).
      const enriched = incoming.map((e) => reclassify(applyPayeeMaster(e)));
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
      entries: entries.map((e) => reclassify(e)),
      loadedFiles: [...new Set([...state.loadedFiles, "샘플데이터_5월.xlsx"])],
      completedSteps: { ...state.completedSteps, "자료 넣기": true },
    })),

  reset: () =>
    set({ entries: [], loadedFiles: [], completedSteps: { ...STEP_DEFAULT } }),

  approve: (id) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.settlementId === id ? { ...e, itemStatus: "승인완료" as ItemStatus } : e
      ),
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
        return { ...merged, itemStatus: "수정완료" as ItemStatus };
      }),
    })),

  markStep: (step, done) =>
    set((state) => ({
      completedSteps: { ...state.completedSteps, [step]: done },
    })),
}));
