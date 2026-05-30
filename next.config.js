/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages 등 정적 호스팅에서 동작하도록 정적 내보내기를 사용한다.
  // 서버 저장 없이 브라우저에서만 동작하는 앱이라 export 모드가 적합하다.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
