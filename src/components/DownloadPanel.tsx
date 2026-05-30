"use client";

import { useSettlementStore } from "@/store/useSettlementStore";
import {
  exportLedger,
  exportProjectCost,
  exportAllowance,
  exportWithholding,
  exportMonthEndPayments,
  exportBulkTransfer,
  exportInspectionReport,
} from "@/lib/exporters";
import { selectBulkTransfer } from "@/lib/selectors";

/** 출력물 다운로드 — 정산원장에서 파생된 목적별 엑셀을 내려받는다. */
export default function DownloadPanel() {
  const entries = useSettlementStore((s) => s.entries);
  const markStep = useSettlementStore((s) => s.markStep);
  const bulkCount = selectBulkTransfer(entries).length;

  const buttons: { label: string; hint: string; onClick: () => void; primary?: boolean; disabled?: boolean }[] = [
    { label: "정산원장 엑셀", hint: "모든 출력물의 기준 데이터", onClick: () => exportLedger(entries) },
    { label: "프로젝트비 관리자료", hint: "프로젝트비 반영 항목", onClick: () => exportProjectCost(entries) },
    { label: "수당명세서용 자료", hint: "개인 지급 항목", onClick: () => exportAllowance(entries) },
    { label: "원천세 신고자료", hint: "세무법인 제출용 · 세전/원천세/주민세/실지급액", onClick: () => exportWithholding(entries) },
    { label: "월말 지급 예정 목록", hint: "이번 달 실제 지급 대상", onClick: () => exportMonthEndPayments(entries) },
    { label: "검수 리포트", hint: "마감 조건 점검 결과", onClick: () => exportInspectionReport(entries) },
  ];

  return (
    <div className="space-y-3">
      <div className="ds-card bg-brand-light">
        <p className="text-base font-bold text-brand-dark">신한은행 대량이체 파일</p>
        <p className="mt-1 text-sm text-ink-soft">
          {bulkCount > 0
            ? `대량이체 대상 ${bulkCount}건이 준비됐어요. 실지급액 기준으로 파일을 만들어요.`
            : "아직 대량이체 대상 항목이 없어요. 지급예정·계좌정보가 있는 항목을 승인해 주세요."}
        </p>
        <button
          className="ds-btn-primary mt-3 w-full"
          disabled={bulkCount === 0}
          onClick={() => {
            exportBulkTransfer(entries);
            markStep("대량이체 파일 생성", true);
          }}
        >
          신한은행 대량이체 파일 내려받기
        </button>
      </div>

      <div className="ds-card">
        <p className="mb-3 text-base font-bold">그 외 출력물</p>
        <div className="grid grid-cols-1 gap-2">
          {buttons.map((b) => (
            <button
              key={b.label}
              onClick={b.onClick}
              disabled={b.disabled}
              className="flex items-center justify-between rounded-2xl border border-[#eceef1] px-4 py-3 text-left hover:bg-surface-muted"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">{b.label}</span>
                <span className="block text-xs text-ink-faint">{b.hint}</span>
              </span>
              <span className="text-brand">↓</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
