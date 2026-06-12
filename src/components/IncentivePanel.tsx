"use client";

import { useMemo, useRef, useState } from "react";
import { useSettlementStore } from "@/store/useSettlementStore";
import { parseDepositFile } from "@/lib/parseFiles";
import { buildIncentiveStatements } from "@/lib/incentive";
import { exportIncentiveStatements } from "@/lib/exporters";
import { getProjectInfos, upsertProjectInfo } from "@/lib/masters";
import { PM_ROLES, PmRole, ProjectInfo, RevenueReceipt } from "@/lib/types";
import { won } from "@/lib/format";

/**
 * 수당명세서(성과 수당) — 매출 수금을 넣으면, 정산원장 비용과 합쳐
 * 프로젝트별 (수금−비용)×비율로 직원별 수당을 자동 계산한다.
 */
export default function IncentivePanel() {
  const receipts = useSettlementStore((s) => s.receipts);
  const entries = useSettlementStore((s) => s.entries);
  const addReceipts = useSettlementStore((s) => s.addReceipts);
  const [projectsVer, setProjectsVer] = useState(0); // 프로젝트 마스터 변경 강제 리렌더
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const projects = useMemo(() => getProjectInfos(), [projectsVer]);

  // 수금이 있는 월 목록 → 기본은 가장 최근(많은) 월
  const months = useMemo(() => {
    const set = new Set(receipts.map((r) => r.receiptMonth).filter(Boolean));
    if (set.size === 0 && entries[0]) set.add(entries[0].attributionMonth);
    return Array.from(set).sort().reverse();
  }, [receipts, entries]);
  const [month, setMonth] = useState<string>("");
  const activeMonth = month || months[0] || "";

  const statements = useMemo(
    () => buildIncentiveStatements(receipts, entries, projects, activeMonth),
    [receipts, entries, projects, activeMonth]
  );

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const rs = await parseDepositFile(f);
        addReceipts(rs);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const hasIncentive = statements.some((s) => s.total > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-faint">
        매출 수금을 넣으면, 정산원장의 프로젝트 비용과 합쳐 <b>(수금−비용)×비율</b>로 직원별 수당을 자동 계산해요.
        수당은 정산 이체와 별개(다음 달 급여)예요.
      </p>

      {/* 1) 매출 수금 넣기 */}
      <div className="ds-card space-y-3">
        <p className="text-base font-bold">1. 매출 수금 넣기</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => onUpload(e.target.files)}
        />
        <button className="ds-btn-primary w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "읽는 중…" : "신한은행 입금내역 올리기"}
        </button>
        <ManualReceiptForm />
      </div>

      {/* 2) 수금 확인 */}
      <ReceiptList />

      {/* 3) 월 선택 + 수당명세서 */}
      <div className="ds-card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold">수당명세서</p>
          {months.length > 0 && (
            <select
              className="rounded-xl border border-[#e5e8eb] px-3 py-1.5 text-sm"
              value={activeMonth}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>{m} 기준</option>
              ))}
            </select>
          )}
        </div>

        {statements.length === 0 ? (
          <p className="text-sm text-ink-faint">
            확인된 수금이 없어요. 위에서 수금을 넣고 “확인”하면 수당이 계산돼요.
          </p>
        ) : (
          <div className="space-y-3">
            {statements.map((st) => (
              <div key={st.recipient} className="rounded-2xl bg-surface-muted p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold">{st.recipient}</p>
                  <p className="text-base font-bold text-brand">{won(st.total)}</p>
                </div>
                <div className="space-y-1.5">
                  {st.lines.map((l, i) => (
                    <div key={i} className="rounded-xl bg-surface px-3 py-2 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span>{l.projectName}</span>
                        <span>{won(l.incentive)}</span>
                      </div>
                      <div className="mt-0.5 text-ink-faint">
                        수금 {won(l.revenue)} − 비용 {won(l.cost)} = {won(l.margin)} × {l.rate ? `${Math.round(l.rate * 100)}%` : "비율?"}
                        {l.role ? ` (${l.role})` : ""}
                      </div>
                      {l.warning && <div className="mt-0.5 text-warn">⚠ {l.warning}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button
              className="ds-btn-primary w-full"
              disabled={!hasIncentive}
              onClick={() => exportIncentiveStatements(statements, activeMonth)}
            >
              수당명세서 엑셀 다운로드
            </button>
          </div>
        )}
      </div>

      {/* 4) 프로젝트 PM·역할 설정 */}
      <ProjectSetup projects={projects} onChange={() => setProjectsVer((v) => v + 1)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 수금 수동 입력
// ---------------------------------------------------------------------------
function ManualReceiptForm() {
  const addReceipts = useSettlementStore((s) => s.addReceipts);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ projectName: "", clientName: "", supplyAmount: "", receiptDate: "" });

  function add() {
    if (!f.projectName.trim() || Number(f.supplyAmount) <= 0) return;
    const date = f.receiptDate;
    const r: RevenueReceipt = {
      id: `Rm-${Date.now()}`,
      receiptMonth: date ? date.slice(0, 7) : new Date().toISOString().slice(0, 7),
      clientName: f.clientName.trim(),
      projectName: f.projectName.trim(),
      bankName: "신한은행",
      receiptDate: date,
      supplyAmount: Number(f.supplyAmount),
      memo: "수동 입력",
      confirmed: true,
      rawText: "",
    };
    addReceipts([r]);
    setF({ projectName: "", clientName: "", supplyAmount: "", receiptDate: "" });
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="ds-btn-ghost w-full" onClick={() => setOpen(true)}>
        직접 입력하기
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl bg-surface-muted p-3">
      <input className="ds-input" placeholder="프로젝트명" value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} />
      <input className="ds-input" placeholder="고객사명" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="ds-input" type="number" placeholder="공급가액" value={f.supplyAmount} onChange={(e) => setF({ ...f, supplyAmount: e.target.value })} />
        <input className="ds-input" type="date" value={f.receiptDate} onChange={(e) => setF({ ...f, receiptDate: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button className="ds-btn-ghost flex-1" onClick={() => setOpen(false)}>취소</button>
        <button className="ds-btn-primary flex-1" onClick={add}>추가</button>
      </div>
      <PanelInputStyle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 수금 목록 + 확인
// ---------------------------------------------------------------------------
function ReceiptList() {
  const receipts = useSettlementStore((s) => s.receipts);
  const updateReceipt = useSettlementStore((s) => s.updateReceipt);
  const confirmReceipt = useSettlementStore((s) => s.confirmReceipt);
  const removeReceipt = useSettlementStore((s) => s.removeReceipt);

  if (receipts.length === 0) return null;
  const pending = receipts.filter((r) => !r.confirmed).length;

  return (
    <div className="ds-card space-y-3">
      <p className="text-base font-bold">
        2. 수금 확인 {pending > 0 && <span className="text-sm font-normal text-warn">· 확인 {pending}건</span>}
      </p>
      <div className="space-y-2">
        {receipts.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface-muted p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{won(r.supplyAmount)}</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-ink-faint">{r.receiptDate || "날짜?"}</span>
                <button className="text-danger" onClick={() => removeReceipt(r.id)}>삭제</button>
              </div>
            </div>
            {r.rawText && <p className="text-xs text-ink-faint">적요: {r.rawText.slice(0, 50)}</p>}
            <div className="grid grid-cols-2 gap-2">
              <input
                className="ds-input"
                placeholder="프로젝트명 (어느 매출?)"
                value={r.projectName}
                onChange={(e) => updateReceipt(r.id, { projectName: e.target.value })}
              />
              <input
                className="ds-input"
                placeholder="고객사명"
                value={r.clientName}
                onChange={(e) => updateReceipt(r.id, { clientName: e.target.value })}
              />
            </div>
            <button
              className={`w-full rounded-xl py-2.5 text-sm font-semibold ${
                r.confirmed ? "bg-[#e7f7ee] text-ok" : "bg-brand text-white"
              }`}
              onClick={() => confirmReceipt(r.id, !r.confirmed)}
              disabled={!r.projectName}
            >
              {r.confirmed ? "확인됨 ✓ (눌러서 취소)" : "이 프로젝트 수금으로 확인"}
            </button>
          </div>
        ))}
      </div>
      <PanelInputStyle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 프로젝트 PM·역할 설정
// ---------------------------------------------------------------------------
function ProjectSetup({ projects, onChange }: { projects: ProjectInfo[]; onChange: () => void }) {
  const receipts = useSettlementStore((s) => s.receipts);
  const [f, setF] = useState({ projectName: "", clientName: "", educationName: "", recipient: "", role: "제안서 작성" as PmRole });

  // 수금엔 있는데 마스터엔 없는 프로젝트 추천
  const known = new Set(projects.map((p) => p.projectName.replace(/\s+/g, "")));
  const missing = Array.from(
    new Set(receipts.map((r) => r.projectName).filter((n) => n && !known.has(n.replace(/\s+/g, ""))))
  );

  function save() {
    if (!f.projectName.trim() || !f.recipient.trim()) return;
    upsertProjectInfo({
      projectName: f.projectName.trim(),
      clientName: f.clientName.trim(),
      educationName: f.educationName.trim(),
      assignments: [{ recipient: f.recipient.trim(), role: f.role }],
    });
    setF({ projectName: "", clientName: "", educationName: "", recipient: "", role: "제안서 작성" });
    onChange();
  }

  return (
    <div className="ds-card space-y-3">
      <div>
        <p className="text-base font-bold">프로젝트 설정 (PM·역할 = 비율)</p>
        <p className="mt-0.5 text-xs text-ink-faint">제안서 작성 10% · 운영 5%. 프로젝트마다 PM 1명을 정해요.</p>
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl bg-[#fff7ee] px-3 py-2 text-xs text-warn">
          설정이 필요한 프로젝트: {missing.join(", ")}
          <div className="mt-1 flex flex-wrap gap-1">
            {missing.map((m) => (
              <button key={m} className="rounded-lg bg-white px-2 py-1 font-semibold text-ink-soft" onClick={() => setF((s) => ({ ...s, projectName: m }))}>
                {m} 설정
              </button>
            ))}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <ul className="space-y-1.5">
          {projects.map((p) => (
            <li key={p.id} className="rounded-2xl bg-surface-muted px-3 py-2 text-sm">
              <span className="font-semibold">{p.projectName}</span>
              <span className="text-ink-faint"> · {p.assignments[0]?.recipient ?? "PM?"} ({p.assignments[0]?.role ?? "역할?"})</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <input className="ds-input" placeholder="프로젝트명" value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className="ds-input" placeholder="고객사명" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
          <input className="ds-input" placeholder="교육명" value={f.educationName} onChange={(e) => setF({ ...f, educationName: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="ds-input" placeholder="PM(수령자)" value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} />
          <select className="ds-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as PmRole })}>
            {PM_ROLES.map((r) => <option key={r} value={r}>{r} {r === "제안서 작성" ? "10%" : "5%"}</option>)}
          </select>
        </div>
      </div>
      <button className="ds-btn-primary w-full" onClick={save}>프로젝트 저장</button>
      <PanelInputStyle />
    </div>
  );
}

function PanelInputStyle() {
  return (
    <style jsx global>{`
      .ds-input {
        width: 100%;
        border: 1px solid #e5e8eb;
        border-radius: 14px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
      }
      .ds-input:focus { border-color: #3182f6; }
    `}</style>
  );
}
