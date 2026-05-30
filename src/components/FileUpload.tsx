"use client";

import { useRef, useState } from "react";
import { parseSpreadsheetFile, parseTextMemo } from "@/lib/parseFiles";
import { useSettlementStore } from "@/store/useSettlementStore";
import { buildSampleEntries } from "@/lib/sampleData";

/** 자료 넣기 — 엑셀/CSV 파일 또는 텍스트 메모를 업로드한다. */
export default function FileUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const addEntries = useSettlementStore((s) => s.addEntries);
  const loadSample = useSettlementStore((s) => s.loadSample);
  const loadedFiles = useSettlementStore((s) => s.loadedFiles);
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState("");
  const [showMemo, setShowMemo] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const entries = await parseSpreadsheetFile(file);
        addEntries(entries, file.name);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onMemo() {
    if (!memo.trim()) return;
    const entries = parseTextMemo(memo);
    addEntries(entries, "메모 입력");
    setMemo("");
    setShowMemo(false);
  }

  return (
    <div className="ds-card space-y-3">
      <div>
        <p className="text-base font-bold">자료 넣기</p>
        <p className="mt-1 text-sm text-ink-faint">
          기존 엑셀 파일이나 메모를 올리면 앱이 정산 항목을 자동으로 분류해요.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        className="ds-btn-primary w-full"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? "읽는 중…" : "엑셀 / CSV 파일 올리기"}
      </button>

      <div className="flex gap-2">
        <button className="ds-btn-ghost flex-1" onClick={() => setShowMemo((v) => !v)}>
          텍스트 메모 붙여넣기
        </button>
        <button
          className="ds-btn-ghost flex-1"
          onClick={() => loadSample(buildSampleEntries())}
        >
          샘플 데이터로 해보기
        </button>
      </div>

      {showMemo && (
        <div className="space-y-2">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={4}
            placeholder={"한 줄에 한 항목씩 적어주세요.\n예) 삼송 AX 강사비 김철수 1,000,000 신한 110-123-456789 지급예정"}
            className="w-full rounded-2xl border border-[#e5e8eb] p-3 text-sm outline-none focus:border-brand"
          />
          <button className="ds-btn-primary w-full" onClick={onMemo}>
            메모에서 항목 만들기
          </button>
        </div>
      )}

      {loadedFiles.length > 0 && (
        <p className="text-xs text-ink-faint">
          넣은 자료: {loadedFiles.join(", ")}
        </p>
      )}
    </div>
  );
}
