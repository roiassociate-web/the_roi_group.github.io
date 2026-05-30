"use client";

import { useState } from "react";
import { useSettlementStore } from "@/store/useSettlementStore";
import { evaluateClosing } from "@/lib/closing";
import SummaryCards from "@/components/SummaryCards";
import StepProgress from "@/components/StepProgress";
import FileUpload from "@/components/FileUpload";
import ReviewBox from "@/components/ReviewBox";
import ChecklistPanel from "@/components/ChecklistPanel";
import DownloadPanel from "@/components/DownloadPanel";
import ReportMessage from "@/components/ReportMessage";

type View = "home" | "upload" | "review" | "downloads" | "report" | "checklist";

export default function Page() {
  const entries = useSettlementStore((s) => s.entries);
  const completedSteps = useSettlementStore((s) => s.completedSteps);
  const [view, setView] = useState<View>("home");

  const hasData = entries.length > 0;
  const reviewNeeded = entries.filter((e) => e.itemStatus === "확인필요").length;
  const { allDone } = evaluateClosing(entries);

  // 다음 단계 활성화 조건
  const canReview = hasData;
  const canDownload = hasData && reviewNeeded === 0;

  return (
    <main className="space-y-5">
      <Header view={view} onHome={() => setView("home")} />

      {view === "home" && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold">이번 달 월말 정산</h1>
            <p className="mt-1 text-sm text-ink-faint">
              엑셀을 올리면 앱이 먼저 분류해요. 확인 필요한 항목만 검토하면 돼요.
            </p>
          </div>

          <SummaryCards entries={entries} />

          {!hasData ? (
            <FileUpload />
          ) : (
            <div className="space-y-3">
              {/* 메인 버튼: 확인 필요한 항목부터 보기 */}
              <button
                className="ds-btn-primary w-full py-4 text-base"
                onClick={() => setView("review")}
              >
                {reviewNeeded > 0
                  ? `확인 필요한 항목 ${reviewNeeded}건부터 보기`
                  : "자동 분류 결과 보기"}
              </button>
              {/* 보조 버튼 */}
              <div className="flex gap-2">
                <button className="ds-btn-ghost flex-1" onClick={() => setView("upload")}>
                  자료 추가하기
                </button>
                <button className="ds-btn-ghost flex-1" onClick={() => setView("review")}>
                  전체 항목 보기
                </button>
              </div>
            </div>
          )}

          <StepProgress completed={completedSteps} />

          {hasData && (
            <div className="grid grid-cols-2 gap-3">
              <NextButton label="지급 목록 · 출력물" onClick={() => setView("downloads")} disabled={!canDownload} disabledHint="확인 필요 항목을 모두 처리하면 열려요." />
              <NextButton label="마감 체크리스트" onClick={() => setView("checklist")} disabled={!hasData} />
              <NextButton label="팀 보고 메시지" onClick={() => setView("report")} disabled={!hasData} />
              <NextButton label="자료 더 넣기" onClick={() => setView("upload")} disabled={false} />
            </div>
          )}

          {allDone && (
            <div className="ds-card bg-ok text-center text-white">
              <p className="text-base font-bold">월말 정산 마감 완료 🎉</p>
              <p className="mt-1 text-sm opacity-90">팀 보고 메시지를 보내면 끝이에요.</p>
            </div>
          )}
        </div>
      )}

      {view === "upload" && (
        <Section title="자료 넣기">
          <FileUpload />
        </Section>
      )}

      {view === "review" && (
        <Section title="자동 분류 검토함">
          {canReview ? <ReviewBox /> : <Empty />}
        </Section>
      )}

      {view === "downloads" && (
        <Section title="지급 목록 · 출력물 다운로드">
          {canDownload ? (
            <DownloadPanel />
          ) : (
            <div className="ds-card text-sm text-ink-soft">
              확인 필요 항목 {reviewNeeded}건을 처리하면 대량이체 파일을 만들 수 있어요.
            </div>
          )}
        </Section>
      )}

      {view === "report" && (
        <Section title="팀 보고">
          <ReportMessage />
        </Section>
      )}

      {view === "checklist" && (
        <Section title="마감 점검">
          <ChecklistPanel />
        </Section>
      )}
    </main>
  );
}

function Header({ view, onHome }: { view: View; onHome: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onHome} className="text-sm font-bold text-ink">
        월말 정산 체크룸
      </button>
      {view !== "home" && (
        <button onClick={onHome} className="text-sm text-ink-faint">
          ← 홈으로
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="ds-card text-center text-sm text-ink-faint">
      먼저 자료를 넣어주세요.
    </div>
  );
}

function NextButton({
  label,
  onClick,
  disabled,
  disabledHint,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : ""}
      className="ds-card text-left text-sm font-semibold text-ink disabled:opacity-40"
    >
      {label}
      <span className="mt-0.5 block text-xs font-normal text-ink-faint">
        {disabled ? disabledHint ?? "" : "바로 이동"}
      </span>
    </button>
  );
}
