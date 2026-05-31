"use client";

import { useState } from "react";
import { useSettlementStore } from "@/store/useSettlementStore";
import { buildReportMessage, evaluateClosing } from "@/lib/closing";

/** 팀 보고 메시지 자동 생성 — 복사할 수 있게 보여준다. */
export default function ReportMessage() {
  const entries = useSettlementStore((s) => s.entries);
  const markStep = useSettlementStore((s) => s.markStep);
  const [copied, setCopied] = useState(false);

  const { allDone } = evaluateClosing(entries);
  const message = buildReportMessage(entries);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      markStep("팀 보고 완료", true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ds-card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold">팀 보고 메시지</p>
        {allDone ? (
          <span className="ds-chip bg-[#e7f7ee] text-ok">보고 준비 완료</span>
        ) : (
          <span className="ds-chip bg-[#fff4e5] text-warn">마감 전 미리보기</span>
        )}
      </div>
      <p className="text-sm text-ink-faint">
        {allDone ? "팀에 보고할 문구가 준비됐어요." : "남은 조건을 채우면 정식 보고 문구가 완성돼요. (지금은 미리보기)"}
      </p>
      <pre className="whitespace-pre-wrap rounded-2xl bg-surface-muted p-4 text-sm leading-relaxed text-ink">
        {message}
      </pre>
      <button className="ds-btn-primary w-full" onClick={copy}>
        {copied ? "복사했어요 ✓" : "보고 메시지 복사하기"}
      </button>
    </div>
  );
}
