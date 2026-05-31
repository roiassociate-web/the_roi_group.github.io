import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "월말 정산 체크룸",
  description: "더로이그룹 월말 정산 자동 분류 검토함",
  // 내부용 앱이므로 검색엔진 색인을 막는다.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="mx-auto min-h-screen w-full max-w-[640px] px-4 pb-24 pt-6">
          {children}
        </div>
      </body>
    </html>
  );
}
