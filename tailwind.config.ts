import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 토스 스타일의 차분한 팔레트
        brand: {
          DEFAULT: "#3182f6",
          dark: "#1b64da",
          light: "#e8f3ff",
        },
        ink: {
          DEFAULT: "#191f28",
          soft: "#4e5968",
          faint: "#8b95a1",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f2f4f6",
        },
        ok: "#15803d",
        warn: "#b45309",
        danger: "#dc2626",
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
