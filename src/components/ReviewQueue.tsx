"use client";

import { useState } from "react";
import { LedgerEntry, EvidenceType, PartyType, PaymentStatus } from "@/lib/types";
import { useSettlementStore } from "@/store/useSettlementStore";
import { reclassify, isApprovable } from "@/lib/classificationRules";
import { isKnownBank } from "@/lib/bankCodes";
import { won } from "@/lib/format";
import EditModal from "./EditModal";

interface Props {
  /** 확인 필요 항목을 모두 처리했을 때 다음 단계로 이동 */
  onDone: () => void;
}

/**
 * 확인 필요 항목을 한 번에 한 장씩 처리하는 검토 큐.
 * 전체 폼 대신 그 항목에서 부족한 정보만 질문한다(토스 방식).
 */
export default function ReviewQueue({ onDone }: Props) {
  const entries = useSettlementStore((s) => s.entries);
  const bulkApprove = useSettlementStore((s) => s.bulkApproveHighConfidence);
  const [skipIds, setSkipIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");

  const queue = entries.filter((e) => e.itemStatus === "확인필요");
  // "다음에 하기"로 미룬 항목은 뒤로 보낸다.
  const ordered = [
    ...queue.filter((e) => !skipIds.includes(e.settlementId)),
    ...queue.filter((e) => skipIds.includes(e.settlementId)),
  ];
  const current = ordered[0];

  // 일괄 승인 가능한 항목(신뢰도 높음 + 사유 없음 + 미승인)
  const bulkEligible = entries.filter(
    (e) => e.confidence === "높음" && e.reviewReasons.length === 0 && e.itemStatus === "자동분류됨"
  ).length;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  // ---- 큐 비었을 때: 일괄 승인 제안 → 완료 화면 ----
  if (!current) {
    return (
      <div className="space-y-4">
        {toast && <Toast msg={toast} />}
        {bulkEligible > 0 ? (
          <div className="ds-card space-y-4 text-center">
            <p className="text-4xl">👍</p>
            <div>
              <p className="text-lg font-bold">남은 {bulkEligible}건은 문제없어 보여요</p>
              <p className="mt-1 text-sm text-ink-faint">
                신뢰도가 높아서 바로 승인해도 괜찮아요.
              </p>
            </div>
            <button
              className="ds-btn-primary w-full py-4 text-base"
              onClick={() => {
                const n = bulkApprove();
                showToast(`${n}건을 한 번에 승인했어요`);
              }}
            >
              {bulkEligible}건 모두 승인하기
            </button>
          </div>
        ) : (
          <div className="ds-card space-y-4 text-center">
            <p className="text-4xl">🎉</p>
            <div>
              <p className="text-lg font-bold">확인할 항목이 없어요</p>
              <p className="mt-1 text-sm text-ink-faint">
                모든 항목이 정리됐어요. 이제 지급 목록을 확인하면 돼요.
              </p>
            </div>
            <button className="ds-btn-primary w-full py-4 text-base" onClick={onDone}>
              지급 목록 확인하러 가기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toast && <Toast msg={toast} />}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-ink-soft">
          확인 필요 <span className="text-warn">{queue.length}건</span> 남음
        </p>
        {ordered.length > 1 && (
          <button
            className="text-sm text-ink-faint"
            onClick={() => setSkipIds((s) => [...s.filter((id) => id !== current.settlementId), current.settlementId])}
          >
            다음에 하기 →
          </button>
        )}
      </div>
      <QueueCard
        key={current.settlementId}
        entry={current}
        onResolved={(msg) => showToast(msg)}
      />
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <p className="rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white">
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------------------
// 카드 한 장 — 부족한 정보만 질문한다.
// ---------------------------------------------------------------------------

interface CardProps {
  entry: LedgerEntry;
  onResolved: (toast: string) => void;
}

function QueueCard({ entry, onResolved }: CardProps) {
  const edit = useSettlementStore((s) => s.edit);
  const approve = useSettlementStore((s) => s.approve);
  const hold = useSettlementStore((s) => s.hold);
  const exclude = useSettlementStore((s) => s.exclude);
  const [draft, setDraft] = useState<Partial<LedgerEntry>>({});
  const [fullEdit, setFullEdit] = useState(false);

  const merged = { ...entry, ...draft };
  const amount = merged.netAmount || merged.preTaxAmount || merged.totalAmount;

  // 이 항목에서 물어볼 것들만 추려낸다.
  const needsParty = merged.partyType === "확인 필요";
  const needsStatus = merged.paymentStatus === "확인 필요";
  const needsEvidence = merged.evidenceType === "확인 필요";
  const needsName = !merged.payeeName;
  const needsProject = !merged.projectName;
  const needsAmount = amount <= 0;
  const wantsAccount =
    merged.isMonthEndPayment && (draft.paymentStatus ?? entry.paymentStatus) === "지급예정";
  const needsBank = wantsAccount && (!merged.bankName || !isKnownBank(merged.bankName));
  const needsAccountNo = wantsAccount && !merged.accountNumber;
  const needsHolder = wantsAccount && !merged.accountHolder;

  const hasQuestions =
    needsParty || needsStatus || needsEvidence || needsName ||
    needsProject || needsAmount || needsBank || needsAccountNo || needsHolder;
  const answered = Object.keys(draft).length > 0;

  function setField<K extends keyof LedgerEntry>(key: K, value: LedgerEntry[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function onSave() {
    // 저장 전에 결과를 미리 계산해 적절한 안내를 보여준다.
    const preview = reclassify({ ...entry, ...draft });
    edit(entry.settlementId, draft);
    if (preview.reviewReasons.length === 0) {
      onResolved("정리됐어요 ✓ 다음 항목을 볼게요");
    } else {
      onResolved(`저장했어요. 이 항목은 아직 확인할 게 ${preview.reviewReasons.length}개 남았어요`);
    }
  }

  function onApprove() {
    approve(entry.settlementId);
    onResolved("승인했어요 ✓");
  }

  const approvable = isApprovable(entry) && !hasQuestions;

  return (
    <div className="ds-card space-y-4">
      {/* 항목 요약 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-bold">{merged.payeeName || "이름 미상"}</p>
          <p className="text-sm text-ink-faint">
            {merged.costType}
            {merged.projectName ? ` · ${merged.projectName}` : ""}
          </p>
        </div>
        <p className="text-xl font-bold">{won(amount)}</p>
      </div>

      {/* 자동 분류 요약 한 줄 */}
      <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-soft">
        {entry.isWithholding
          ? `${entry.withholdingType === "기타소득" ? "기타소득(8.8%)" : "사업소득(3.3%)"} 신고 대상으로 분류했어요.`
          : entry.costType === "신용카드"
            ? "신용카드 결제 항목이라 대량이체에서는 제외했어요."
            : "원천세 신고 없이 처리하는 항목으로 분류했어요."}
        {entry.isBulkTransfer ? " 대량이체에 포함돼요." : ""}
      </p>

      {/* 질문들 — 부족한 것만 */}
      {needsName && (
        <Question label="누구에게 지급하는 항목인가요?">
          <input
            className="ds-input"
            placeholder="대상자 또는 업체명"
            value={String(draft.payeeName ?? "")}
            onChange={(e) => setField("payeeName", e.target.value)}
          />
        </Question>
      )}

      {needsParty && (
        <Question label="개인에게 지급하나요, 업체에게 지급하나요?">
          <ChipRow
            options={["개인", "업체"]}
            value={draft.partyType}
            onPick={(v) => setField("partyType", v as PartyType)}
          />
        </Question>
      )}

      {needsStatus && (
        <Question label="이 항목은 지급 예정인가요, 이미 지급했나요?">
          <ChipRow
            options={["지급예정", "지급완료", "지급보류"]}
            value={draft.paymentStatus}
            onPick={(v) => setField("paymentStatus", v as PaymentStatus)}
          />
        </Question>
      )}

      {needsEvidence && (
        <Question label="증빙은 어떻게 처리하나요?">
          <ChipRow
            options={["사업소득 신고", "세금계산서", "신용카드", "현금영수증", "내부정산"]}
            value={draft.evidenceType}
            onPick={(v) => setField("evidenceType", v as EvidenceType)}
          />
        </Question>
      )}

      {needsAmount && (
        <Question label="지급할 금액(세전)을 알려주세요.">
          <input
            type="number"
            className="ds-input"
            placeholder="예: 1000000"
            value={draft.preTaxAmount ?? ""}
            onChange={(e) => setField("preTaxAmount", Number(e.target.value))}
          />
        </Question>
      )}

      {needsProject && (
        <Question label="어느 프로젝트에 귀속되나요?">
          <input
            className="ds-input"
            placeholder="프로젝트명"
            value={String(draft.projectName ?? "")}
            onChange={(e) => setField("projectName", e.target.value)}
          />
        </Question>
      )}

      {(needsBank || needsAccountNo || needsHolder) && (
        <Question label="이체할 계좌 정보가 필요해요.">
          <div className="space-y-2">
            {needsBank && (
              <input
                className="ds-input"
                placeholder={merged.bankName ? `은행명 확인 필요 (현재: ${merged.bankName})` : "은행명 (예: 신한은행)"}
                value={String(draft.bankName ?? "")}
                onChange={(e) => setField("bankName", e.target.value)}
              />
            )}
            {needsAccountNo && (
              <input
                className="ds-input"
                placeholder="계좌번호"
                value={String(draft.accountNumber ?? "")}
                onChange={(e) => setField("accountNumber", e.target.value)}
              />
            )}
            {needsHolder && (
              <input
                className="ds-input"
                placeholder={`예금주 (보통 ${merged.payeeName || "대상자"}와 동일)`}
                value={String(draft.accountHolder ?? "")}
                onChange={(e) => setField("accountHolder", e.target.value)}
              />
            )}
          </div>
        </Question>
      )}

      {/* 메인 버튼 하나 */}
      {hasQuestions ? (
        <button
          className="ds-btn-primary w-full py-4 text-base"
          disabled={!answered}
          onClick={onSave}
        >
          {answered ? "저장하고 다음" : "위 질문에 답해주세요"}
        </button>
      ) : (
        <button
          className="ds-btn-primary w-full py-4 text-base"
          disabled={!approvable}
          onClick={onApprove}
        >
          이대로 승인
        </button>
      )}

      {/* 보조 액션은 작게 */}
      <div className="flex items-center justify-center gap-5 text-sm text-ink-faint">
        <button onClick={() => setFullEdit(true)} className="underline">전체 수정</button>
        <button onClick={() => { hold(entry.settlementId); onResolved("보류했어요. 이번 달 마감에서 빠져요"); }}>
          보류
        </button>
        <button onClick={() => { exclude(entry.settlementId); onResolved("제외했어요"); }}>
          제외
        </button>
      </div>

      {fullEdit && <EditModal entry={entry} onClose={() => setFullEdit(false)} />}

      <style jsx global>{`
        .ds-input {
          width: 100%;
          border: 1px solid #e5e8eb;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 15px;
          outline: none;
        }
        .ds-input:focus {
          border-color: #3182f6;
        }
      `}</style>
    </div>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl bg-brand-light p-3">
      <p className="text-sm font-semibold text-brand-dark">{label}</p>
      {children}
    </div>
  );
}

function ChipRow({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: unknown;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            value === o ? "bg-brand text-white" : "bg-surface text-ink-soft"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
