import dynamic from 'next/dynamic'

// Client-only — charts use hover state and read live data in the browser.
const AnalyticsReport = dynamic(
  () => import('@/components/analytics/AnalyticsReport').then(m => m.AnalyticsReport),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen" style={{ background: '#0a1a3a' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-blue-400 text-xs tracking-widest uppercase">Loading analytics…</span>
        </div>
      </div>
    ),
  },
)

export default function AnalyticsPage() {
  return <AnalyticsReport />
}
