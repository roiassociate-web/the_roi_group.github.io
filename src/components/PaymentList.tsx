"use client";

import { useSettlementStore } from "@/store/useSettlementStore";
import { selectMonthEndPayments, selectBulkTransfer } from "@/lib/selectors";
import { payableAmount } from "@/lib/exporters";
import { won } from "@/lib/format";

interface Props {
  /** 목록 확인 완료 후 다음 단계(대량이체 파일)로 이동 */
  onConfirm: () => void;
}

/** 월말 지급 예정 목록을 한 화면에서 확인하고 다음 단계로 넘어간다. */
export default function PaymentList({ onConfirm }: Props) {
  const entries = useSettlementStore((s) => s.entries);
  const markStep = useSettlementStore((s) => s.markStep);

  const payments = selectMonthEndPayments(entries);
  const bulk = selectBulkTransfer(entries);
  const bulkIds = new Set(bulk.map((e) => e.settlementId));
  const total = payments.reduce((s, e) => s + payableAmount(e), 0);
  const bulkTotal = bulk.reduce((s, e) => s + payableAmount(e), 0);

  if (payments.length === 0) {
    return (
      <div className="ds-card space-y-3 text-center">
        <p className="text-3xl">📭</p>
        <p className="text-base font-bold">이번 달 지급할 항목이 없어요</p>
        <p className="text-sm text-ink-faint">
          승인된 항목 중 지급예정인 것이 없어요. 항목을 승인했는지 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 총액 히어로 */}
      <div className="ds-card text-center">
        <p className="text-sm text-ink-faint">이번 달 지급 예정</p>
        <p className="mt-1 text-3xl font-bold">{won(total)}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {payments.length}건 · 이 중 대량이체 {bulk.length}건 ({won(bulkTotal)})
        </p>
      </div>

      {/* 지급 목록 */}
      <div className="ds-card divide-y divide-[#f2f4f6] p-2">
        {payments.map((e) => (
          <div key={e.settlementId} className="flex items-center justify-between px-3 py-3">
            <div>
              <p className="text-sm font-semibold">{e.payeeName}</p>
              <p className="text-xs text-ink-faint">
                {e.costType}
                {e.projectName ? ` · ${e.projectName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{won(payableAmount(e))}</p>
              <p className="text-xs text-ink-faint">
                {bulkIds.has(e.settlementId) ? "대량이체" : e.bankName ? "계좌이체" : "이체 방법 확인"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        className="ds-btn-primary w-full py-4 text-base"
        onClick={() => {
          markStep("지급 목록 확인", true);
          onConfirm();
        }}
      >
        이 목록대로 진행할게요
      </button>
      <p className="text-center text-xs text-ink-faint">
        다음 단계에서 신한은행 대량이체 파일을 만들어요.
      </p>
    </div>
  );
}
