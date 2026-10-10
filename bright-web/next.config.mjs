/** @type {import('next').NextConfig} */
const nextConfig = {
  // One static page; wrangler.jsonc / firebase.json serve ./out and fall back to it.
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
