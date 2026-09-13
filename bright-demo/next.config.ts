import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A static site: the only server code was /api/session, which bright-proxy replaced.
  // `next build` writes it to out/, which wrangler serves as Workers static assets.
  output: "export",
};

export default nextConfig;
