"use client";

import { useState } from "react";
import { useSettlementStore } from "@/store/useSettlementStore";
import ReviewCard from "./ReviewCard";

type Tab = "확인필요" | "자동분류됨" | "제외/보류";

/** 자동 분류 검토함 — 3개 탭으로 항목을 나눠 보여준다. */
export default function ReviewBox() {
  const entries = useSettlementStore((s) => s.entries);
  const bulkApprove = useSettlementStore((s) => s.bulkApproveHighConfidence);
  const [tab, setTab] = useState<Tab>("확인필요");
  const [toast, setToast] = useState("");

  const needReview = entries.filter((e) => e.itemStatus === "확인필요");
  const autoOrApproved = entries.filter(
    (e) => e.itemStatus === "자동분류됨" || e.itemStatus === "승인완료" || e.itemStatus === "수정완료"
  );
  const excludedHeld = entries.filter((e) => e.itemStatus === "보류" || e.itemStatus === "제외");

  const tabs: { key: Tab; count: number }[] = [
    { key: "확인필요", count: needReview.length },
    { key: "자동분류됨", count: autoOrApproved.length },
    { key: "제외/보류", count: excludedHeld.length },
  ];

  const list = tab === "확인필요" ? needReview : tab === "자동분류됨" ? autoOrApproved : excludedHeld;

  const highConfidenceCount = entries.filter(
    (e) => e.confidence === "높음" && e.reviewReasons.length === 0 && e.itemStatus === "자동분류됨"
  ).length;

  function onBulk() {
    const n = bulkApprove();
    setToast(n > 0 ? `신뢰도 높은 ${n}건을 한 번에 승인했어요.` : "지금 일괄 승인할 항목이 없어요.");
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <div className="space-y-4">
      {/* 일괄 승인 */}
      {highConfidenceCount > 0 && (
        <div className="ds-card flex items-center justify-between bg-brand-light">
          <p className="text-sm font-semibold text-brand-dark">
            신뢰도 높은 {highConfidenceCount}건은 바로 승인할 수 있어요.
          </p>
          <button className="ds-btn-primary" onClick={onBulk}>일괄 승인</button>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === t.key ? "bg-ink text-white" : "bg-surface text-ink-soft"
            }`}
          >
            {t.key} {t.count}
          </button>
        ))}
      </div>

      {toast && <p className="rounded-xl bg-ok px-3 py-2 text-center text-sm text-white">{toast}</p>}

      {/* 카드 목록 */}
      {list.length === 0 ? (
        <div className="ds-card text-center text-sm text-ink-faint">
          {tab === "확인필요"
            ? "확인이 필요한 항목이 없어요. 다음 단계로 넘어가도 좋아요."
            : "해당하는 항목이 없어요."}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((e) => (
            <ReviewCard key={e.settlementId} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
