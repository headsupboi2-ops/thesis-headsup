import dynamic from 'next/dynamic'

const ImpactReport = dynamic(
  () => import('@/components/impact/ImpactReport').then(m => m.ImpactReport),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen" style={{ background: '#0a1a3a' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-blue-400 text-xs tracking-widest uppercase">Loading your area…</span>
        </div>
      </div>
    ),
  },
)

export default function MyAreaPage() {
  return <ImpactReport />
}
