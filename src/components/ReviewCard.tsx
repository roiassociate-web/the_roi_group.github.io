"use client";

import { useState } from "react";
import { LedgerEntry } from "@/lib/types";
import { won, confidenceColor, statusColor } from "@/lib/format";
import { useSettlementStore } from "@/store/useSettlementStore";
import { isApprovable } from "@/lib/classificationRules";
import EditModal from "./EditModal";

interface Props {
  entry: LedgerEntry;
}

/** 정산 항목 카드 — 표 대신 카드로 보여주고 승인/수정/보류/제외만 남긴다. */
export default function ReviewCard({ entry }: Props) {
  const approve = useSettlementStore((s) => s.approve);
  const hold = useSettlementStore((s) => s.hold);
  const exclude = useSettlementStore((s) => s.exclude);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const amount = entry.netAmount || entry.preTaxAmount || entry.totalAmount;
  const approvable = isApprovable(entry);

  function onApproveClick() {
    // 신뢰도 낮은 항목은 짧은 확인 질문을 통해서만 승인할 수 있다.
    if (entry.confidence === "낮음") {
      setConfirming(true);
    } else {
      approve(entry.settlementId);
    }
  }

  return (
    <div className="ds-card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-bold">{entry.payeeName || "이름 미상"}</p>
          <p className="text-sm text-ink-faint">
            {entry.costType}
            {entry.projectName ? ` · ${entry.projectName}` : ""}
          </p>
        </div>
        <p className="text-lg font-bold">{won(amount)}</p>
      </div>

      {/* 자동 분류 결과 칩 */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`ds-chip ${statusColor(entry.itemStatus)}`}>{entry.itemStatus}</span>
        <span className={`ds-chip ${confidenceColor(entry.confidence)}`}>신뢰도 {entry.confidence}</span>
        {entry.isWithholding && <span className="ds-chip bg-surface-muted text-ink-soft">원천세 대상</span>}
        {entry.isMonthEndPayment && <span className="ds-chip bg-surface-muted text-ink-soft">월말 지급</span>}
        {entry.isBulkTransfer ? (
          <span className="ds-chip bg-[#e7f7ee] text-ok">대량이체 포함</span>
        ) : entry.costType === "신용카드" ? (
          <span className="ds-chip bg-surface-muted text-ink-soft">카드결제·이체 제외</span>
        ) : null}
      </div>

      {/* 사업소득 안내 + 세금 자동 계산 결과 */}
      {entry.evidenceType === "사업소득 신고" && entry.withholdingTax > 0 && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-soft">
          사업소득 신고 대상으로 보여요. 원천세 {won(entry.withholdingTax)}, 주민세 {won(entry.residentTax)}를 자동 계산해두었어요.
        </p>
      )}

      {/* 확인 필요 사유 */}
      {entry.reviewReasons.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-[#fff7ee] px-3 py-2">
          {entry.reviewReasons.map((r, i) => (
            <li key={i} className="text-xs text-warn">• {r}</li>
          ))}
        </ul>
      )}

      {/* 확인 질문 (신뢰도 낮음 승인 게이트) */}
      {confirming && (
        <div className="rounded-2xl bg-brand-light p-3 text-sm">
          <p className="mb-2 font-semibold text-brand-dark">
            이 항목은 이번 달 정산 대상이 맞나요?
          </p>
          <div className="flex gap-2">
            <button
              className="ds-btn-primary flex-1"
              onClick={() => { approve(entry.settlementId); setConfirming(false); }}
            >
              네, 승인할게요
            </button>
            <button className="ds-btn-ghost flex-1" onClick={() => setConfirming(false)}>
              아니요
            </button>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      {!confirming && (
        <div className="grid grid-cols-4 gap-2">
          <button
            className="ds-btn-primary"
            onClick={onApproveClick}
            disabled={!approvable}
            title={approvable ? "" : "필수값이 부족해 아직 승인할 수 없어요."}
          >
            승인
          </button>
          <button className="ds-btn-ghost" onClick={() => setEditing(true)}>수정</button>
          <button className="ds-btn-ghost" onClick={() => hold(entry.settlementId)}>보류</button>
          <button className="ds-btn-ghost" onClick={() => exclude(entry.settlementId)}>제외</button>
        </div>
      )}
      {!approvable && !confirming && (
        <p className="text-xs text-danger">필수값을 채우면 승인할 수 있어요. 수정을 눌러 보완해 주세요.</p>
      )}

      {editing && <EditModal entry={entry} onClose={() => setEditing(false)} />}
    </div>
  );
}
