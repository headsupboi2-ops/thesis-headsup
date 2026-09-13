/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,   // Leaflet breaks under StrictMode double-mount

  // Proxy /api/* to Flask in local dev, so the frontend always uses relative
  // URLs (lib/constants.ts API_BASE is '' in production). In production this
  // rewrite never runs: the top-level "services" rewrites in the repo-root
  // vercel.json route /api/* straight to the backend service before the
  // request reaches this Next.js app at all.
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      const backend = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
      return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }]
    }
    return []
  },
}
export default nextConfig
