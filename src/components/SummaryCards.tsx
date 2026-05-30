"use client";

import { LedgerEntry } from "@/lib/types";
import { selectBulkTransfer } from "@/lib/selectors";
import { evaluateClosing } from "@/lib/closing";

interface Props {
  entries: LedgerEntry[];
}

/** 첫 화면 요약 카드 4개 — 전체 표 대신 핵심 숫자만 보여준다. */
export default function SummaryCards({ entries }: Props) {
  const autoClassified = entries.filter(
    (e) => e.itemStatus === "자동분류됨" || e.itemStatus === "승인완료" || e.itemStatus === "수정완료"
  ).length;
  const reviewNeeded = entries.filter((e) => e.itemStatus === "확인필요").length;
  const bulkReady = selectBulkTransfer(entries).length;
  const { conditions } = evaluateClosing(entries);
  const remainingSteps = conditions.filter((c) => !c.done).length;

  const cards = [
    { label: "자동 분류 완료", value: autoClassified, suffix: "건", tone: "text-brand" },
    { label: "확인 필요", value: reviewNeeded, suffix: "건", tone: "text-warn" },
    { label: "대량이체 가능", value: bulkReady, suffix: "건", tone: "text-ok" },
    { label: "마감까지 남은 단계", value: remainingSteps, suffix: "개", tone: "text-ink" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="ds-card">
          <p className="text-[13px] text-ink-faint">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold ${c.tone}`}>
            {c.value}
            <span className="ml-0.5 text-base font-semibold text-ink-soft">{c.suffix}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
