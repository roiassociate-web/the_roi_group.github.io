// 표시용 포매팅 헬퍼

export function won(n: number): string {
  return `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
}

export function confidenceColor(c: "높음" | "중간" | "낮음"): string {
  if (c === "높음") return "bg-[#e7f7ee] text-ok";
  if (c === "중간") return "bg-[#fff4e5] text-warn";
  return "bg-[#fdeaea] text-danger";
}

export function statusColor(s: string): string {
  switch (s) {
    case "승인완료":
    case "수정완료":
      return "bg-[#e7f7ee] text-ok";
    case "확인필요":
      return "bg-[#fff4e5] text-warn";
    case "보류":
      return "bg-surface-muted text-ink-soft";
    case "제외":
      return "bg-[#fdeaea] text-danger";
    default:
      return "bg-brand-light text-brand-dark";
  }
}
