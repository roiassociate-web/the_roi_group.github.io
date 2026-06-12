"use client";

import { useEffect, useState } from "react";
import { PayeeMaster, ProjectAlias, RecurringTemplate, EVIDENCE_TYPES } from "@/lib/types";
import {
  getPayeeMasters,
  upsertPayeeMaster,
  removePayeeMaster,
  getProjectAliases,
  upsertProjectAlias,
  removeProjectAlias,
  getRecurringTemplates,
  removeRecurringTemplate,
} from "@/lib/masters";
import { useSettlementStore } from "@/store/useSettlementStore";
import { won } from "@/lib/format";

/**
 * 입력 줄이기 — 지급대상자 마스터 / 약칭 사전 / 이전 달 반복 항목을 관리한다.
 * 같은 정보를 반복 입력하지 않도록 저장해두고 업로드 시 자동으로 불러온다.
 */
export default function MastersPanel() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-faint">
        자주 쓰는 정보를 저장해두면, 다음에 같은 대상자나 프로젝트가 올라올 때 앱이 자동으로 채워줘요.
      </p>
      <PayeeMasterSection />
      <ProjectAliasSection />
      <RecurringSection />
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="ds-card space-y-3">
      <div>
        <p className="text-base font-bold">{title}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{desc}</p>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1) 지급대상자 마스터
// ---------------------------------------------------------------------------
const EMPTY_PAYEE: PayeeMaster = {
  name: "",
  aliases: [],
  partyType: "개인",
  bankName: "",
  bankCode: "",
  accountNumber: "",
  accountHolder: "",
  idOrBizNumber: "",
  defaultEvidence: "사업소득 신고",
  defaultWithholding: true,
  defaultWithholdingType: "사업소득",
};

function PayeeMasterSection() {
  const [list, setList] = useState<PayeeMaster[]>([]);
  const [form, setForm] = useState<PayeeMaster>(EMPTY_PAYEE);
  const [aliasText, setAliasText] = useState("");

  useEffect(() => setList(getPayeeMasters()), []);

  function save() {
    if (!form.name.trim()) return;
    upsertPayeeMaster({
      ...form,
      accountHolder: form.accountHolder || form.name,
      aliases: aliasText.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setList(getPayeeMasters());
    setForm(EMPTY_PAYEE);
    setAliasText("");
  }
  function remove(name: string) {
    removePayeeMaster(name);
    setList(getPayeeMasters());
  }

  return (
    <Section title="지급대상자 마스터" desc="지급처 DB예요. 항목을 승인하면 자동으로 저장되고, 같은 대상자는 다음부터 자동 매핑돼요.">
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.name} className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{p.name} <span className="text-xs font-normal text-ink-faint">· {p.partyType}</span></p>
                <p className="text-xs text-ink-faint">
                  {p.bankName || "은행 미입력"} {p.accountNumber}
                  {p.idOrBizNumber ? ` · ${p.idOrBizNumber}` : ""}
                  {p.defaultWithholding ? ` · ${p.defaultWithholdingType ?? "사업소득"}` : ""}
                </p>
                {(p.aliases?.length ?? 0) > 0 && (
                  <p className="text-xs text-ink-faint">별칭: {p.aliases!.join(", ")}</p>
                )}
              </div>
              <button className="text-xs text-danger" onClick={() => remove(p.name)}>삭제</button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input className="ds-input" placeholder="성명/업체명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="ds-input" value={form.partyType} onChange={(e) => setForm({ ...form, partyType: e.target.value as PayeeMaster["partyType"] })}>
          {["개인", "업체"].map((o) => <option key={o}>{o}</option>)}
        </select>
        <input className="ds-input" placeholder="은행명" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
        <input className="ds-input" placeholder="계좌번호" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
        <input className="ds-input" placeholder="예금주(미입력 시 성명)" value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} />
        <input className="ds-input" placeholder="주민/사업자번호" value={form.idOrBizNumber} onChange={(e) => setForm({ ...form, idOrBizNumber: e.target.value })} />
        <select className="ds-input" value={form.defaultEvidence} onChange={(e) => setForm({ ...form, defaultEvidence: e.target.value as PayeeMaster["defaultEvidence"] })}>
          {EVIDENCE_TYPES.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select className="ds-input" value={form.defaultWithholdingType ?? "사업소득"} onChange={(e) => setForm({ ...form, defaultWithholdingType: e.target.value as PayeeMaster["defaultWithholdingType"] })}>
          <option value="사업소득">사업소득 3.3%</option>
          <option value="기타소득">기타소득 8.8%</option>
        </select>
        <label className="flex items-center gap-2 px-1 text-sm text-ink-soft">
          <input type="checkbox" checked={form.defaultWithholding} onChange={(e) => setForm({ ...form, defaultWithholding: e.target.checked })} />
          원천세 대상
        </label>
        <input className="ds-input col-span-2" placeholder="별칭 (쉼표 구분: 김철수 강사, 철수쌤)" value={aliasText} onChange={(e) => setAliasText(e.target.value)} />
      </div>
      <button className="ds-btn-primary w-full" onClick={save}>대상자 저장</button>
      <PanelInputStyle />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 2) 프로젝트/고객사 약칭 사전
// ---------------------------------------------------------------------------
function ProjectAliasSection() {
  const [list, setList] = useState<ProjectAlias[]>([]);
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [aliases, setAliases] = useState("");

  useEffect(() => setList(getProjectAliases()), []);

  function save() {
    if (!project.trim()) return;
    upsertProjectAlias({
      canonicalClient: client.trim(),
      canonicalProject: project.trim(),
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setList(getProjectAliases());
    setClient(""); setProject(""); setAliases("");
  }
  function remove(p: string) {
    removeProjectAlias(p);
    setList(getProjectAliases());
  }

  return (
    <Section title="프로젝트 / 고객사 약칭 사전" desc='"삼송", "삼송 AX", "AX 컨설팅"처럼 같은 프로젝트의 약칭을 묶어요.'>
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.canonicalProject} className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{a.canonicalProject} <span className="text-xs font-normal text-ink-faint">· {a.canonicalClient}</span></p>
                <p className="text-xs text-ink-faint">약칭: {a.aliases.join(", ") || "없음"}</p>
              </div>
              <button className="text-xs text-danger" onClick={() => remove(a.canonicalProject)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <input className="ds-input" placeholder="표준 고객사명 (예: 삼송전자)" value={client} onChange={(e) => setClient(e.target.value)} />
        <input className="ds-input" placeholder="표준 프로젝트명 (예: 삼송 AX 컨설팅)" value={project} onChange={(e) => setProject(e.target.value)} />
        <input className="ds-input" placeholder="약칭들 (쉼표로 구분: 삼송, 삼송 AX, AX 컨설팅)" value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </div>
      <button className="ds-btn-primary w-full" onClick={save}>약칭 저장</button>
      <PanelInputStyle />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3) 이전 달 반복 항목
// ---------------------------------------------------------------------------
function RecurringSection() {
  const [list, setList] = useState<RecurringTemplate[]>([]);
  const [toast, setToast] = useState("");
  const importRecurring = useSettlementStore((s) => s.importRecurring);
  const saveRecurring = useSettlementStore((s) => s.saveRecurring);

  useEffect(() => setList(getRecurringTemplates()), []);

  function onImport() {
    const n = importRecurring();
    setToast(n > 0 ? `반복 항목 ${n}건을 이번 달 후보로 불러왔어요. 검토함에서 확인해 주세요.` : "저장된 반복 항목이 없어요.");
    setTimeout(() => setToast(""), 2800);
  }
  function onSaveCurrent() {
    const n = saveRecurring();
    setList(getRecurringTemplates());
    setToast(`현재 정산원장에서 반복 항목 ${n}건을 다음 달용으로 저장했어요.`);
    setTimeout(() => setToast(""), 2800);
  }
  function remove(t: RecurringTemplate) {
    removeRecurringTemplate(t.payeeName, t.costType);
    setList(getRecurringTemplates());
  }

  return (
    <Section title="이전 달 반복 항목" desc="고정 외주비·반복 강사비·정기 대여비 등을 이번 달 후보로 불러와요.">
      {list.length > 0 ? (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={`${t.payeeName}|${t.costType}`} className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{t.payeeName} <span className="text-xs font-normal text-ink-faint">· {t.costType}</span></p>
                <p className="text-xs text-ink-faint">{t.projectName || "프로젝트 미지정"} · {won(t.defaultPreTaxAmount)}</p>
              </div>
              <button className="text-xs text-danger" onClick={() => remove(t)}>삭제</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-faint">아직 저장된 반복 항목이 없어요. 이번 달 정산을 끝낸 뒤 아래 버튼으로 저장해두면 다음 달에 불러올 수 있어요.</p>
      )}

      {toast && <p className="rounded-xl bg-ok px-3 py-2 text-center text-sm text-white">{toast}</p>}

      <div className="flex gap-2">
        <button className="ds-btn-primary flex-1" onClick={onImport} disabled={list.length === 0}>이번 달 후보로 불러오기</button>
        <button className="ds-btn-ghost flex-1" onClick={onSaveCurrent}>현재 항목 저장</button>
      </div>
    </Section>
  );
}

/** 입력 스타일 (EditModal과 동일한 ds-input). */
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
      .ds-input:focus {
        border-color: #3182f6;
      }
    `}</style>
  );
}
