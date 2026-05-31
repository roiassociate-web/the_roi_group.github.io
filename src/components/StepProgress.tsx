"use client";

import { WizardStep } from "@/store/useSettlementStore";

interface Props {
  completed: Record<WizardStep, boolean>;
}

const STEPS: WizardStep[] = [
  "자료 넣기",
  "자동 분류 확인",
  "지급 목록 확인",
  "대량이체 파일 생성",
  "팀 보고 완료",
];

/** 단계 UI — 각 단계의 완료 여부를 체크 표시로 보여준다. */
export default function StepProgress({ completed }: Props) {
  return (
    <div className="ds-card">
      <p className="mb-3 text-sm font-semibold text-ink-soft">마감 단계</p>
      <ol className="space-y-2">
        {STEPS.map((step, i) => {
          const done = completed[step];
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? "bg-ok text-white" : "bg-surface-muted text-ink-faint"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-sm ${done ? "text-ink" : "text-ink-faint"}`}>{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
