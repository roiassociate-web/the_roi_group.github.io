/** @type {import('next').NextConfig} */

// GitHub Pages 프로젝트 페이지는 https://<owner>.github.io/<repo>/ 경로로 서빙되므로
// 배포 시에만 basePath를 붙인다. 로컬 dev(npm run dev)는 루트(/)로 동작한다.
// GitHub Actions 워크플로에서 GITHUB_PAGES=true 를 설정한다.
const isPages = process.env.GITHUB_PAGES === "true";
const repoBasePath = "/the_roi_group.github.io";

const nextConfig = {
  // GitHub Pages 등 정적 호스팅에서 동작하도록 정적 내보내기를 사용한다.
  // 서버 저장 없이 브라우저에서만 동작하는 앱이라 export 모드가 적합하다.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  ...(isPages ? { basePath: repoBasePath, assetPrefix: repoBasePath } : {}),
};

module.exports = nextConfig;
