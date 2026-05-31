"use client";

import { useState } from "react";
import { LedgerEntry, COST_TYPES, EVIDENCE_TYPES, PartyType, PaymentStatus, PaymentMethod } from "@/lib/types";
import { calcTaxFromPreTax, calcTaxFromNet } from "@/lib/taxCalc";
import { won } from "@/lib/format";
import { useSettlementStore } from "@/store/useSettlementStore";

interface Props {
  entry: LedgerEntry;
  onClose: () => void;
}

function isBizIncomeEntry(costType: string, evidence: string): boolean {
  return (
    evidence === "사업소득 신고" ||
    ["사업소득", "강사비", "용역비", "아르바이트비"].includes(costType)
  );
}

/** 수정 모달 — 사업소득 대상이면 세금 자동 계산/잠금, 수동 수정 시 사유 필수. */
export default function EditModal({ entry, onClose }: Props) {
  const edit = useSettlementStore((s) => s.edit);
  const [form, setForm] = useState<LedgerEntry>({ ...entry });
  const [reason, setReason] = useState("");
  const [taxUnlocked, setTaxUnlocked] = useState(!!entry.taxManualOverride);
  const [taxReason, setTaxReason] = useState("");
  const [askNetOrPre, setAskNetOrPre] = useState(false);

  const bizIncome = isBizIncomeEntry(form.costType, form.evidenceType);

  function set<K extends keyof LedgerEntry>(key: K, value: LedgerEntry[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // 세전 지급액이 바뀌면 즉시 세금 재계산 (잠금 상태일 때만).
  function onPreTaxChange(v: number) {
    if (bizIncome && !taxUnlocked) {
      const t = calcTaxFromPreTax(v);
      setForm((f) => ({ ...f, preTaxAmount: t.preTaxAmount, withholdingTax: t.withholdingTax, residentTax: t.residentTax, netAmount: t.netAmount }));
    } else {
      set("preTaxAmount", v);
    }
  }

  // "이 금액은 세전인가요, 실지급액인가요?" 처리
  function answerNet(asNet: boolean) {
    const amount = form.preTaxAmount;
    if (bizIncome) {
      const t = asNet ? calcTaxFromNet(amount) : calcTaxFromPreTax(amount);
      setForm((f) => ({ ...f, preTaxAmount: t.preTaxAmount, withholdingTax: t.withholdingTax, residentTax: t.residentTax, netAmount: t.netAmount }));
    }
    setAskNetOrPre(false);
  }

  function onSave() {
    const patch: Partial<LedgerEntry> = {
      payeeName: form.payeeName,
      clientName: form.clientName,
      projectName: form.projectName,
      partyType: form.partyType,
      costType: form.costType,
      evidenceType: form.evidenceType,
      paymentStatus: form.paymentStatus,
      paymentMethod: form.paymentMethod,
      preTaxAmount: form.preTaxAmount,
      totalAmount: form.totalAmount,
      bankName: form.bankName,
      accountNumber: form.accountNumber,
      accountHolder: form.accountHolder,
      memo: form.memo,
      taxManualOverride: taxUnlocked,
    };
    if (taxUnlocked) {
      patch.withholdingTax = form.withholdingTax;
      patch.residentTax = form.residentTax;
      patch.netAmount = form.netAmount;
    }
    const note = [reason, taxUnlocked && taxReason ? `세금수동:${taxReason}` : ""]
      .filter(Boolean)
      .join(" / ");
    edit(entry.settlementId, patch, note || undefined);
    onClose();
  }

  const saveDisabled = taxUnlocked && !taxReason.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-bold">항목 수정</p>
          <button className="text-ink-faint" onClick={onClose}>닫기</button>
        </div>

        <div className="space-y-3">
          <Field label="대상자 / 업체명">
            <input className="ds-input" value={form.payeeName} onChange={(e) => set("payeeName", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="고객사명">
              <input className="ds-input" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} />
            </Field>
            <Field label="프로젝트명">
              <input className="ds-input" value={form.projectName} onChange={(e) => set("projectName", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="개인/업체">
              <select className="ds-input" value={form.partyType} onChange={(e) => set("partyType", e.target.value as PartyType)}>
                {["개인", "업체", "확인 필요"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="비용유형">
              <select className="ds-input" value={form.costType} onChange={(e) => set("costType", e.target.value as LedgerEntry["costType"])}>
                {COST_TYPES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="증빙방식">
              <select className="ds-input" value={form.evidenceType} onChange={(e) => set("evidenceType", e.target.value as LedgerEntry["evidenceType"])}>
                {EVIDENCE_TYPES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="지급상태">
              <select className="ds-input" value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value as PaymentStatus)}>
                {["지급예정", "지급완료", "지급보류", "확인 필요"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>

          <Field label="지급방법">
            <select className="ds-input" value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value as PaymentMethod)}>
              {["계좌이체", "대량이체", "카드결제", "현금", "확인 필요"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>

          {/* 금액 + 세금 */}
          <Field label={bizIncome ? "세전 지급액" : "금액"}>
            <input
              type="number"
              className="ds-input"
              value={form.preTaxAmount}
              onChange={(e) => onPreTaxChange(Number(e.target.value))}
              onBlur={() => bizIncome && setAskNetOrPre(true)}
            />
          </Field>

          {askNetOrPre && bizIncome && (
            <div className="rounded-2xl bg-brand-light p-3 text-sm">
              <p className="mb-2 font-semibold text-brand-dark">이 금액은 세전 지급액인가요, 실제 입금액인가요?</p>
              <div className="flex gap-2">
                <button className="ds-btn-ghost flex-1" onClick={() => answerNet(false)}>세전 지급액</button>
                <button className="ds-btn-ghost flex-1" onClick={() => answerNet(true)}>실제 입금액</button>
              </div>
            </div>
          )}

          {bizIncome && (
            <div className="rounded-2xl bg-surface-muted p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">세금 자동 계산</p>
                <button
                  className="text-xs font-semibold text-brand"
                  onClick={() => setTaxUnlocked((v) => !v)}
                >
                  {taxUnlocked ? "자동 계산으로 되돌리기" : "수동 수정"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <TaxBox label="원천세" value={form.withholdingTax} locked={!taxUnlocked} onChange={(v) => set("withholdingTax", v)} />
                <TaxBox label="주민세" value={form.residentTax} locked={!taxUnlocked} onChange={(v) => set("residentTax", v)} />
                <TaxBox label="실지급액" value={form.netAmount} locked={!taxUnlocked} onChange={(v) => set("netAmount", v)} />
              </div>
              <p className="mt-2 text-xs text-ink-faint">실지급액 {won(form.netAmount)} (세전 기준 3.3% 공제)</p>
              {taxUnlocked && (
                <input
                  className="ds-input mt-2"
                  placeholder="수정 사유를 적어주세요 (필수)"
                  value={taxReason}
                  onChange={(e) => setTaxReason(e.target.value)}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="은행명">
              <input className="ds-input" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </Field>
            <Field label="계좌번호">
              <input className="ds-input" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
            </Field>
          </div>
          <Field label="예금주">
            <input className="ds-input" value={form.accountHolder} onChange={(e) => set("accountHolder", e.target.value)} />
          </Field>
          <Field label="메모">
            <input className="ds-input" value={form.memo} onChange={(e) => set("memo", e.target.value)} />
          </Field>

          <Field label="수정 사유 (선택)">
            <input className="ds-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex gap-2">
          <button className="ds-btn-ghost flex-1" onClick={onClose}>취소</button>
          <button className="ds-btn-primary flex-1" onClick={onSave} disabled={saveDisabled}>
            저장하기
          </button>
        </div>
        {saveDisabled && (
          <p className="mt-2 text-center text-xs text-danger">세금을 수동으로 바꾸려면 사유가 필요해요.</p>
        )}
      </div>

      <style jsx global>{`
        .ds-input {
          width: 100%;
          border: 1px solid #e5e8eb;
          border-radius: 14px;
          padding: 10px 12px;
          font-size: 14px;
          outline: none;
        }
        .ds-input:focus {
          border-color: #3182f6;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function TaxBox({ label, value, locked, onChange }: { label: string; value: number; locked: boolean; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-faint">{label}</span>
      <input
        type="number"
        className="ds-input"
        value={value}
        disabled={locked}
        onChange={(e) => onChange(Number(e.target.value))}
        style={locked ? { background: "#f2f4f6", color: "#8b95a1" } : undefined}
      />
    </label>
  );
}
