// 샘플 데이터 — 업로드 없이 분류/다운로드 흐름을 바로 테스트하기 위한 3건+ 데이터.
// classifyRow를 거쳐 실제 분류 결과와 동일하게 만든다.

import { LedgerEntry } from "./types";
import { classifyRow, ClassifyContext } from "./classificationRules";

const month = "2026-05";

function ctx(seq: number): ClassifyContext {
  return {
    sourceFile: "샘플데이터_5월.xlsx",
    sheetName: "샘플",
    rowIndex: seq,
    attributionMonth: month,
    paymentMonth: month,
    reportMonth: month,
    idSeq: seq,
  };
}

const SAMPLE_ROWS: Record<string, string | number | null>[] = [
  {
    // 1) 개인 강사비 → 사업소득/원천세/대량이체 대상
    고객사: "삼송전자",
    프로젝트: "삼송 AX 컨설팅",
    비용유형: "강사비",
    대상자: "김철수",
    주민등록번호: "850101-1******",
    세전지급액: 1000000,
    은행: "신한은행",
    계좌번호: "110-123-456789",
    예금주: "김철수",
    지급상태: "지급예정",
    담당자: "이담당",
    메모: "5월 4주차 강의",
  },
  {
    // 2) 세금계산서 업체 비용(미지급) → 원천세 제외, 월말 지급 포함
    고객사: "삼송전자",
    프로젝트: "삼송 AX 컨설팅",
    비용유형: "세금계산서",
    업체명: "(주)교재나라",
    공급가액: 500000,
    부가세: 50000,
    은행: "국민은행",
    계좌번호: "012-45-67890",
    예금주: "(주)교재나라",
    지급상태: "지급예정",
    담당자: "이담당",
    메모: "교재 인쇄 세금계산서 발행",
  },
  {
    // 3) 신용카드 지출 → 프로젝트비만, 대량이체 제외
    프로젝트: "사내 워크숍",
    비용유형: "신용카드",
    대상자: "법인카드",
    금액: 230000,
    지급상태: "지급완료",
    담당자: "박매니저",
    메모: "다과/문구 카드 결제",
  },
  {
    // 4) 개인 용역비(계좌 누락) → 확인 필요 카드로 노출
    고객사: "라이트하우스",
    프로젝트: "AX 교육 운영",
    비용유형: "용역비",
    대상자: "정프리",
    세전지급액: 800000,
    지급상태: "지급예정",
    담당자: "이담당",
    메모: "운영 보조 용역",
  },
];

/** 샘플 정산원장 항목을 생성한다. */
export function buildSampleEntries(): LedgerEntry[] {
  return SAMPLE_ROWS.map((cells, i) => classifyRow(cells, ctx(i + 1)));
}
