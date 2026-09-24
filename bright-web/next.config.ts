import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // One page, no server: every "page" is client state at the same URL (src/lib/site-nav.tsx).
  // `next build` writes the site to out/, which wrangler serves as Workers static assets.
  output: "export",
};

export default nextConfig;
