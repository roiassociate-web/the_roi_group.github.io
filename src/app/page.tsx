"use client";

import { useEffect, useState } from "react";
import { useSettlementStore, WizardStep } from "@/store/useSettlementStore";
import { evaluateClosing } from "@/lib/closing";
import { selectBulkTransfer } from "@/lib/selectors";
import StepProgress from "@/components/StepProgress";
import FileUpload from "@/components/FileUpload";
import ReviewQueue from "@/components/ReviewQueue";
import ReviewBox from "@/components/ReviewBox";
import PaymentList from "@/components/PaymentList";
import ChecklistPanel from "@/components/ChecklistPanel";
import DownloadPanel from "@/components/DownloadPanel";
import ReportMessage from "@/components/ReportMessage";
import MastersPanel from "@/components/MastersPanel";

type View =
  | "home"
  | "upload"
  | "review"
  | "all"
  | "payments"
  | "downloads"
  | "report"
  | "checklist"
  | "masters";

export default function Page() {
  const entries = useSettlementStore((s) => s.entries);
  const completedSteps = useSettlementStore((s) => s.completedSteps);
  const reset = useSettlementStore((s) => s.reset);
  const [view, setView] = useState<View>("home");

  // 클라이언트 마운트 후 localStorage에서 이전 작업을 복원한다(새로고침 대비).
  useEffect(() => {
    useSettlementStore.persist.rehydrate();
  }, []);

  const hasData = entries.length > 0;
  const reviewNeeded = entries.filter((e) => e.itemStatus === "확인필요").length;
  const bulkEligible = entries.filter(
    (e) => e.confidence === "높음" && e.reviewReasons.length === 0 && e.itemStatus === "자동분류됨"
  ).length;
  const autoDone = entries.filter(
    (e) => e.itemStatus === "승인완료" || e.itemStatus === "수정완료"
  ).length;
  const bulkCount = selectBulkTransfer(entries).length;
  const { allDone } = evaluateClosing(entries);

  // 단계 완료 여부는 가능한 한 상태에서 자동으로 계산한다.
  const steps: Record<WizardStep, boolean> = {
    "자료 넣기": hasData,
    "자동 분류 확인": hasData && reviewNeeded === 0,
    "지급 목록 확인": completedSteps["지급 목록 확인"],
    "대량이체 파일 생성": completedSteps["대량이체 파일 생성"],
    "팀 보고 완료": completedSteps["팀 보고 완료"],
  };

  // 다음 행동 딱 하나만 정한다(토스 방식).
  const next = ((): { label: string; sub: string; view: View } | null => {
    if (!hasData) return null;
    if (reviewNeeded > 0)
      return {
        label: `확인 필요 ${reviewNeeded}건 처리하기`,
        sub: "한 번에 한 건씩, 부족한 정보만 물어볼게요",
        view: "review",
      };
    if (bulkEligible > 0)
      return {
        label: `문제없는 ${bulkEligible}건 승인하기`,
        sub: "신뢰도가 높아서 한 번에 승인할 수 있어요",
        view: "review",
      };
    if (!steps["지급 목록 확인"])
      return { label: "지급 목록 확인하기", sub: "이번 달 실제로 지급할 항목이에요", view: "payments" };
    if (!steps["대량이체 파일 생성"] && bulkCount > 0)
      return { label: "대량이체 파일 만들기", sub: "신한은행 업로드용 엑셀이에요", view: "downloads" };
    if (!steps["팀 보고 완료"])
      return { label: "팀 보고 메시지 만들기", sub: "복사해서 바로 보낼 수 있어요", view: "report" };
    return { label: "마감 완료! 보고 메시지 보기", sub: "수고했어요 🎉", view: "report" };
  })();

  function onReset() {
    if (window.confirm("지금까지 분류·승인한 내용을 모두 지우고 처음부터 시작할까요? (다운로드한 엑셀은 그대로 남아요)")) {
      reset();
      setView("home");
    }
  }

  return (
    <main className="space-y-5">
      <Header view={view} onHome={() => setView("home")} />

      {view === "home" && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">이번 달 월말 정산</h1>
            <p className="mt-1 text-sm text-ink-faint">
              기준은 앱이 먼저 적용했어요. 예외만 확인하면 돼요.
            </p>
          </div>

          {!hasData ? (
            <div className="space-y-3">
              <FileUpload />
              <button className="ds-btn-ghost w-full" onClick={() => setView("masters")}>
                입력 줄이기 · 대상자/약칭 미리 등록하기
              </button>
            </div>
          ) : (
            <>
              {/* 상태 히어로 — 지금 상황을 한 문장으로 */}
              <div className="ds-card text-center">
                {allDone ? (
                  <>
                    <p className="text-4xl">🎉</p>
                    <p className="mt-2 text-lg font-bold">월말 정산 마감 완료</p>
                    <p className="mt-1 text-sm text-ink-faint">팀 보고 메시지만 보내면 끝이에요.</p>
                  </>
                ) : reviewNeeded > 0 ? (
                  <>
                    <p className="text-sm text-ink-faint">확인이 필요한 항목</p>
                    <p className="mt-1 text-4xl font-bold text-warn">{reviewNeeded}건</p>
                    <p className="mt-1 text-sm text-ink-soft">나머지는 앱이 알아서 분류해뒀어요.</p>
                  </>
                ) : (
                  <>
                    <p className="text-4xl">✅</p>
                    <p className="mt-2 text-lg font-bold">모든 항목이 정리됐어요</p>
                    <p className="mt-1 text-sm text-ink-faint">아래 버튼으로 다음 단계를 진행하세요.</p>
                  </>
                )}
                {/* 한 줄 요약 */}
                <p className="mt-3 border-t border-[#f2f4f6] pt-3 text-xs text-ink-faint">
                  전체 {entries.length}건 · 승인 {autoDone}건 · 대량이체 가능 {bulkCount}건
                </p>
              </div>

              <StepProgress completed={steps} />

              {/* 보조 메뉴는 작게, 화면 아래로 */}
              <div className="grid grid-cols-2 gap-2">
                <SmallLink label="자료 추가하기" onClick={() => setView("upload")} />
                <SmallLink label="전체 항목 보기" onClick={() => setView("all")} />
                <SmallLink label="출력물 다운로드" onClick={() => setView("downloads")} />
                <SmallLink label="마감 점검" onClick={() => setView("checklist")} />
                <SmallLink label="입력 줄이기" onClick={() => setView("masters")} />
                <SmallLink label="처음부터 다시" onClick={onReset} danger />
              </div>
              <p className="pb-2 text-center text-xs text-ink-faint">
                작업 내용은 이 기기에 자동 저장돼요.
              </p>
            </>
          )}
        </div>
      )}

      {view === "upload" && (
        <Section title="자료 넣기">
          <FileUpload />
          {hasData && (
            <button className="ds-btn-primary w-full py-4" onClick={() => setView("home")}>
              다 넣었어요
            </button>
          )}
        </Section>
      )}

      {view === "review" && (
        <Section title="하나씩 확인하기">
          {hasData ? (
            <>
              <ReviewQueue onDone={() => setView("payments")} />
              <button className="w-full pt-1 text-center text-sm text-ink-faint underline" onClick={() => setView("all")}>
                표로 전체 항목 보기
              </button>
            </>
          ) : (
            <Empty />
          )}
        </Section>
      )}

      {view === "all" && (
        <Section title="전체 항목">
          {hasData ? <ReviewBox /> : <Empty />}
        </Section>
      )}

      {view === "payments" && (
        <Section title="이번 달 지급 목록">
          {hasData ? <PaymentList onConfirm={() => setView("downloads")} /> : <Empty />}
        </Section>
      )}

      {view === "downloads" && (
        <Section title="출력물 다운로드">
          {reviewNeeded > 0 ? (
            <div className="ds-card space-y-3 text-center">
              <p className="text-sm text-ink-soft">
                확인 필요 항목 {reviewNeeded}건을 처리하면 대량이체 파일을 만들 수 있어요.
              </p>
              <button className="ds-btn-primary w-full py-4" onClick={() => setView("review")}>
                지금 처리하러 가기
              </button>
            </div>
          ) : (
            <>
              <DownloadPanel />
              <button className="ds-btn-primary w-full py-4" onClick={() => setView("report")}>
                다음: 팀 보고 메시지 만들기
              </button>
            </>
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

      {view === "masters" && (
        <Section title="입력 줄이기">
          <MastersPanel />
        </Section>
      )}

      {/* 홈에서만: 다음 행동 버튼 하나를 하단에 고정 */}
      {view === "home" && next && (
        <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[640px] -translate-x-1/2 bg-gradient-to-t from-[#f2f4f6] via-[#f2f4f6]/95 to-transparent px-4 pb-5 pt-6">
          <button
            className="ds-btn-primary w-full rounded-2xl py-4 text-base shadow-card"
            onClick={() => setView(next.view)}
          >
            {next.label}
          </button>
          <p className="mt-1.5 text-center text-xs text-ink-faint">{next.sub}</p>
        </div>
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

function SmallLink({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl bg-surface px-4 py-3 text-left text-sm font-semibold shadow-card ${
        danger ? "text-danger" : "text-ink-soft"
      }`}
    >
      {label}
    </button>
  );
}
