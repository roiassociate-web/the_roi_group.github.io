"use client";

import { useState } from "react";
import { useSettlementStore } from "@/store/useSettlementStore";
import { CLOSING_CHECKLIST, evaluateClosing } from "@/lib/closing";

/** 마감 체크리스트(수동) + 마감 완료 조건(자동 평가). */
export default function ChecklistPanel() {
  const entries = useSettlementStore((s) => s.entries);
  const { conditions, allDone } = evaluateClosing(entries);
  const [checked, setChecked] = useState<boolean[]>(() => CLOSING_CHECKLIST.map(() => false));

  function toggle(i: number) {
    setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <div className="space-y-4">
      {/* 자동 평가되는 마감 완료 조건 */}
      <div className="ds-card">
        <p className="mb-3 text-base font-bold">마감 완료 조건</p>
        <ul className="space-y-2">
          {conditions.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <span className={c.done ? "text-ok" : "text-ink-faint"}>{c.done ? "✓" : "○"}</span>
              <div>
                <p className={`text-sm ${c.done ? "text-ink" : "text-ink-soft"}`}>{c.label}</p>
                <p className="text-xs text-ink-faint">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <div
          className={`mt-3 rounded-2xl px-3 py-2.5 text-center text-sm font-semibold ${
            allDone ? "bg-ok text-white" : "bg-surface-muted text-ink-soft"
          }`}
        >
          {allDone ? "월말 정산 마감 완료" : "아직 마감 전이에요. 위 조건을 모두 채워주세요."}
        </div>
      </div>

      {/* 고정 마감 체크리스트 (사람이 직접 확인) */}
      <div className="ds-card">
        <p className="mb-3 text-base font-bold">마감 체크리스트</p>
        <ul className="space-y-2">
          {CLOSING_CHECKLIST.map((item, i) => (
            <li key={i}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} className="mt-0.5" />
                <span className={`text-sm ${checked[i] ? "text-ink-faint line-through" : "text-ink-soft"}`}>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
