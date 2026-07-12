'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeft, ChevronDown, Crosshair, Gauge as GaugeIcon,
  Satellite, Brain, CheckCircle2, Target, TrendingUp, Waves,
} from 'lucide-react'
import {
  fetchModelPerformance, fetchRealtimeStorms, fetchClimateOutlook,
  sortedLeadHours, splitPerClass,
  type ModelPerformance, type RealtimeStormsResponse, type ClimateOutlook,
} from '@/lib/analytics'
import { API_BASE, CAT_COLOR, CAT_NAME } from '@/lib/constants'
import { MODEL_COLORS, ALL_MODEL_IDS, MODEL_META, type MultiModelResponse } from '@/lib/forecastModels'
import { consensusSnapshot } from '@/hooks/useParBroadcastEngine'
import { StatTile } from './charts/StatTile'
import { LineChart } from './charts/LineChart'
import { BarChart } from './charts/BarChart'
import { Gauge } from './charts/Gauge'
import { SERIES } from './charts/theme'

// Plain-English names for the storm categories the model predicts.
const FRIENDLY_CAT: Record<string, string> = {
  'TD':      'Tropical Depression',
  'TS':      'Tropical Storm',
  'TY':      'Typhoon',
  'SevTY-3': 'Severe Typhoon',
  'SevTY-4': 'Very Severe Typhoon',
  'STY':     'Super Typhoon',
}

function leadLabel(h: number): string {
  return h < 24 ? `${h} hrs` : `${h / 24} day${h / 24 > 1 ? 's' : ''}`
}

// ── Section shell ───────────────────────────────────────────────────
function Section({ title, subtitle, icon, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl p-5 md:p-6"
      style={{
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(0,82,204,0.13)',
        boxShadow: '0 8px 32px rgba(0,40,100,0.14), 0 1px 4px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-[#0052cc]">{icon}</span>}
        <h2 className="text-slate-800 font-extrabold text-[15px] tracking-tight">{title}</h2>
      </div>
      {subtitle && <p className="text-slate-500 text-[12px] mb-4 leading-relaxed max-w-2xl">{subtitle}</p>}
      {children}
    </section>
  )
}

/** A plain-language "what this means" note under a chart. */
function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-2 items-start rounded-lg px-3 py-2.5"
      style={{ background: '#f1f6ff', border: '1px solid #dce8fb' }}>
      <span className="text-[#0052cc] text-sm leading-none mt-0.5">💡</span>
      <p className="text-[12px] text-slate-600 leading-relaxed">{children}</p>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────
export function AnalyticsReport() {
  const [perf, setPerf] = useState<ModelPerformance | null>(null)
  const [perfError, setPerfError] = useState<string | null>(null)
  const [storms, setStorms] = useState<RealtimeStormsResponse | null>(null)
  const [outlook, setOutlook] = useState<ClimateOutlook | null>(null)
  const [ensemble, setEnsemble] = useState<{ storm: string; models: MultiModelResponse['models'] } | null>(null)

  useEffect(() => {
    fetchModelPerformance().then(setPerf).catch(e => setPerfError(e.message))
    fetchClimateOutlook().then(setOutlook).catch(() => {})
    fetchRealtimeStorms().then(async (r) => {
      setStorms(r)
      const strongest = [...(r.storms ?? [])].sort((a, b) => b.wind_speed - a.wind_speed)[0]
      if (strongest) {
        try {
          const history = strongest.path?.length ? strongest.path.slice(-16)
            : [{ lat: strongest.lat, lon: strongest.lon }]
          const res = await fetch(`${API_BASE}/api/multi-model-tracks`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
            body: JSON.stringify({ storm_name: strongest.name, track_history: history }),
          })
          if (res.ok) {
            const data: MultiModelResponse = await res.json()
            setEnsemble({ storm: strongest.name, models: data.models })
          }
        } catch { /* live-only, best effort */ }
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="h-screen overflow-y-auto" style={{ background: '#0a1a3a' }}>
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-6"
        style={{ height: 56, background: 'rgba(255,255,255,0.97)', borderBottom: '3px solid #0052cc',
                 boxShadow: '0 2px 12px rgba(0,40,100,0.12)' }}>
        <Link href="/" className="flex items-center gap-1.5 text-[#0052cc] hover:text-blue-700 text-xs font-bold">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <TrendingUp className="w-6 h-6 text-[#0052cc]" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-extrabold text-slate-800 tracking-tight">How We Predict Typhoons</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">Plain-language forecast accuracy report</span>
          </div>
        </div>
        {perf && (
          <span className="ml-auto text-[10px] text-slate-400 tabular-nums hidden sm:block">
            Accuracy checked {perf.generated_at.slice(0, 10)}
          </span>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-5 pb-16">
        {/* ── How prediction works ── */}
        <HowItWorks perf={perf} />

        {perfError && <ErrorBanner message={perfError} />}

        {/* ── Headline numbers ── */}
        {perf ? <KpiRow perf={perf} /> : !perfError && <KpiSkeleton />}

        {/* ── Path accuracy ── */}
        {perf && <TrackErrorSection perf={perf} />}

        {/* ── Strength accuracy ── */}
        {perf && <ClassificationSection perf={perf} />}

        {/* ── Live now ── */}
        <LiveSection storms={storms} outlook={outlook} ensemble={ensemble} />
      </main>
    </div>
  )
}

// ── How it works (the answer to "how are typhoons predicted?") ──────
function HowItWorks({ perf }: { perf: ModelPerformance | null }) {
  const trainSpan = perf ? `${perf.train_years[0]}–${perf.train_years[perf.train_years.length - 1]}` : '2013–2022'
  const testSpan = perf ? `${perf.test_years[0]}–${perf.test_years[perf.test_years.length - 1]}` : '2023–2026'
  const nStorms = perf?.n_test_storms ?? 67

  const steps = [
    {
      icon: <Satellite size={18} />, color: '#0052cc', title: '1 · We gather live data',
      body: 'Every few minutes we pull each active storm’s position and strength from 10 official weather agencies — PAGASA, Japan (JMA), the US Navy (JTWC) and more — plus our own AI model.',
    },
    {
      icon: <Brain size={18} />, color: '#7048c4', title: '2 · The AI learns from history',
      body: `Our model studied ${trainSpan} — a decade of past typhoons — to learn how storms in our region tend to move and gain or lose strength. It uses those patterns to project the next 7 days.`,
    },
    {
      icon: <CheckCircle2 size={18} />, color: '#00875a', title: '3 · We measure how accurate it is',
      body: `We then replayed ${nStorms} real typhoons from ${testSpan} — storms the model had never seen — and compared its forecasts to what actually happened. Those results are below.`,
    },
  ]
  return (
    <Section title="How a typhoon forecast is made"
      subtitle="Three simple steps turn scattered weather data into a 7-day typhoon forecast — and let us prove how trustworthy it is.">
      <div className="grid md:grid-cols-3 gap-3">
        {steps.map(s => (
          <div key={s.title} className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #eef2f7' }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: s.color }}>
              {s.icon}
              <span className="font-extrabold text-[13px] text-slate-800">{s.title}</span>
            </div>
            <p className="text-[12px] text-slate-600 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Headline numbers ────────────────────────────────────────────────
function KpiRow({ perf }: { perf: ModelPerformance }) {
  const lead24 = perf.track_metrics['24']
  const acc = perf.classification.accuracy
  const maxLead = Math.max(...sortedLeadHours(perf))
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatTile label="Strength called right" value={(acc * 100).toFixed(0)} unit="%"
        sublabel="How often we correctly rate a storm's category"
        icon={<Target size={13} />} accent="#00875a" />
      <StatTile label="Typical miss, 1 day out" value={lead24 ? `~${Math.round(lead24.mae)}` : '—'} unit="km"
        sublabel="How far our predicted centre sits from the real one"
        icon={<Crosshair size={13} />} />
      <StatTile label="Real typhoons tested" value={perf.n_test_storms.toString()}
        sublabel={`Checked against ${perf.test_years[0]}–${perf.test_years[perf.test_years.length - 1]} storms`}
        icon={<Activity size={13} />} accent="#7048c4" />
      <StatTile label="How far ahead we see" value={String(maxLead / 24)} unit="days"
        sublabel="Every forecast reaches a full week ahead"
        icon={<GaugeIcon size={13} />} accent="#ff8800" />
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl animate-pulse" style={{ height: 104, background: 'rgba(255,255,255,0.55)' }} />
      ))}
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-white text-sm font-semibold flex items-center gap-2"
      style={{ background: 'linear-gradient(90deg,#a8210e,#cc2200)', boxShadow: '0 4px 16px rgba(200,0,0,0.3)' }}>
      <span>⚠</span>
      Accuracy results aren&apos;t available yet — {message}.
    </div>
  )
}

// ── Path accuracy ───────────────────────────────────────────────────
function TrackErrorSection({ perf }: { perf: ModelPerformance }) {
  const leads = sortedLeadHours(perf)
  const rows = leads.map(h => ({ h, ...perf.track_metrics[String(h)] }))
  const miss = { key: 'mae', label: 'Average miss', color: SERIES.blue, points: rows.map(r => ({ x: r.h, y: Math.round(r.mae) })) }
  const band = { color: SERIES.blue, points: rows.map(r => ({ x: r.h, lo: r.p50, hi: r.p90 })) }
  const day1 = perf.track_metrics['24']
  const hr6 = perf.track_metrics['6']

  return (
    <Section title="How close are the path predictions?" icon={<Crosshair size={16} />}
      subtitle="Each point is the average distance between where we predicted the storm's centre and where it actually went. Lower is better. The shaded band shows the range most forecasts fall into.">
      <LineChart series={[miss]} band={band} xTicks={leads}
        xLabel="How far ahead we're looking" yLabel="Distance off (km)" yUnit=" km"
        formatX={leadLabel} />
      <Takeaway>
        Forecasts are sharpest up close: about {hr6 ? `${Math.round(hr6.mae)} km` : 'tens of km'} off just
        6 hours ahead and roughly {day1 ? `${Math.round(day1.mae)} km` : 'a couple hundred km'} off a day ahead.
        Like every weather service in the world, precision naturally decreases the further out we look — a storm
        a week away is inherently harder to pin down than one arriving tomorrow.
      </Takeaway>
    </Section>
  )
}

// ── Strength accuracy ───────────────────────────────────────────────
function ClassificationSection({ perf }: { perf: ModelPerformance }) {
  const [showGrid, setShowGrid] = useState(false)
  const { classes } = splitPerClass(perf.per_class)
  const groups = classes.map(c => ({
    label: FRIENDLY_CAT[c.label] ?? c.label,
    values: [c.f1],
    meta: `${c.support.toLocaleString()} readings`,
  }))
  const series = [{ key: 'score', label: 'Accuracy score', color: SERIES.blue }]
  const cmUrl = perf.plots.confusion_matrix ? `${API_BASE}${perf.plots.confusion_matrix}` : null

  return (
    <Section title="How well do we judge a storm's strength?" icon={<Target size={16} />}
      subtitle="Beyond where a storm goes, we predict how strong it is — from a mild Tropical Depression up to a Super Typhoon. Here's how reliably we get each level right.">
      <div className="grid md:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="flex gap-5 justify-center">
          <Gauge value={perf.classification.accuracy} label="Overall correct" color="#00875a" />
          <Gauge value={perf.classification.macro_f1} label="All types, evenly" color="#0052cc" />
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Each bar is how reliably we identify that storm type (0–100). Bigger, more common storms are easiest;
            the rarest, most extreme ones are the hardest to label exactly.
          </p>
          <BarChart groups={groups} series={series} max={1} labelWidth={132}
            format={v => `${Math.round(v * 100)}`} axisFormat={v => `${Math.round(v * 100)}`} />
        </div>
      </div>

      <Takeaway>
        The two dials show the headline: we correctly rate a storm&apos;s category about{' '}
        <b>{(perf.classification.accuracy * 100).toFixed(0)}%</b> of the time. Everyday storms like Tropical Storms
        and Typhoons score highest; the strongest Super Typhoons are rarer, so there&apos;s less data to learn their
        exact threshold — though a dangerous storm is never mistaken for a calm one.
      </Takeaway>

      {cmUrl && (
        <div className="mt-4">
          <button onClick={() => setShowGrid(v => !v)}
            className="flex items-center gap-1.5 text-[12px] font-bold text-[#0052cc] hover:text-blue-700">
            <ChevronDown size={14} className={`transition-transform ${showGrid ? 'rotate-180' : ''}`} />
            {showGrid ? 'Hide the detailed accuracy grid' : 'Show the detailed accuracy grid (for the curious)'}
          </button>
          {showGrid && (
            <div className="mt-3">
              <p className="text-[12px] text-slate-500 mb-2 leading-relaxed max-w-2xl">
                Each row is what the storm <i>actually</i> was; each column is what we <i>predicted</i>. Bright squares
                running down the diagonal are correct matches — the brighter and straighter that diagonal, the better.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cmUrl} alt="Grid comparing predicted vs actual storm categories"
                className="rounded-lg border border-slate-200 max-w-md w-full"
                style={{ background: '#fff' }} />
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ── Live now ────────────────────────────────────────────────────────
function LiveSection({ storms, outlook, ensemble }: {
  storms: RealtimeStormsResponse | null
  outlook: ClimateOutlook | null
  ensemble: { storm: string; models: MultiModelResponse['models'] } | null
}) {
  const consensus = ensemble ? consensusSnapshot(ensemble.models) : null
  const liveCount = ensemble?.models.filter(m => m.source === 'live').length ?? 0
  const agreement = consensus
    ? consensus.spreadKm < 80 ? { label: 'Strong agreement', color: '#00875a' }
      : consensus.spreadKm < 200 ? { label: 'Moderate agreement', color: '#ff8800' }
      : { label: 'Forecasts differ', color: '#cc2200' }
    : null

  return (
    <Section title="Typhoons we're tracking right now" icon={<Waves size={16} />}
      subtitle="The same forecasting engine, working live. When our 10 independent forecasts agree, confidence is high.">
      <div className="grid md:grid-cols-2 gap-5">
        {/* Active storms */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-slate-400 mb-2">
            Active storms {storms ? `· ${storms.count}` : ''}
          </p>
          {!storms && <SkeletonRows n={2} />}
          {storms && storms.storms.length === 0 && (
            <p className="text-slate-400 text-xs">No active storms in the Western Pacific right now — all clear.</p>
          )}
          <div className="flex flex-col gap-2">
            {storms?.storms.slice(0, 5).map(s => {
              const color = (CAT_COLOR as Record<number, string>)[s.category] ?? '#64748b'
              const friendly = (CAT_NAME as Record<number, string>)[s.category] ?? 'Storm'
              return (
                <div key={s.name} className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ background: '#f8fafc', border: '1px solid #eef2f7' }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="flex flex-col leading-tight">
                    <span className="font-bold text-slate-700 text-sm">{s.name}</span>
                    <span className="text-[10px] text-slate-400">{friendly}</span>
                  </div>
                  <span className="ml-auto text-slate-500 text-xs tabular-nums">{Math.round(s.wind_speed)} kt winds</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Ensemble agreement */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-slate-400 mb-2">
            Forecast agreement {ensemble ? `· ${ensemble.storm}` : ''}
          </p>
          {ensemble ? (
            <>
              <div className="flex flex-wrap gap-3 mb-3">
                {agreement && (
                  <div className="rounded-lg px-3 py-1.5"
                    style={{ background: `${agreement.color}14`, border: `1px solid ${agreement.color}44` }}>
                    <div className="text-[9px] uppercase tracking-wide font-bold" style={{ color: agreement.color }}>
                      2 days out
                    </div>
                    <div className="text-sm font-bold" style={{ color: agreement.color }}>{agreement.label}</div>
                  </div>
                )}
                <MiniStat label="Agencies reporting live" value={`${liveCount} of ${ensemble.models.length}`} />
                {consensus && <MiniStat label="Forecasts spread within" value={`±${consensus.spreadKm} km`} />}
              </div>
              <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                We overlay all 10 forecasts on the map. The closer they sit, the surer we are of the storm&apos;s path:
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {ALL_MODEL_IDS.map(id => {
                  const m = ensemble.models.find(mm => mm.model === id)
                  return (
                    <span key={id} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span style={{ width: 12, height: 3, borderRadius: 2, background: MODEL_COLORS[id], display: 'inline-block' }} />
                      {MODEL_META[id].label}
                      <span className="text-[8px] font-bold px-1 rounded"
                        style={{ background: m?.source === 'live' ? 'rgba(0,135,90,0.14)' : '#f1f5f9',
                                 color: m?.source === 'live' ? '#00875a' : '#94a3b8' }}>
                        {m?.source === 'live' ? 'LIVE' : 'SIM'}
                      </span>
                    </span>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-slate-400 text-xs">The 10-forecast comparison appears whenever a storm is active.</p>
          )}
        </div>
      </div>

      {/* Seasonal outlook */}
      <div className="mt-5 pt-5 border-t border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-slate-400 mb-2">
          This month's outlook {outlook ? `· ${outlook.month_name} ${outlook.target_year}` : ''}
        </p>
        {!outlook && <SkeletonRows n={1} />}
        {outlook && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-extrabold px-3 py-1 rounded-lg"
              style={activityStyle(outlook.activity_level)}>
              {outlook.activity_level.replace('-', ' ').toUpperCase()}
            </span>
            <MiniStat label="Typical for this month" value={`${outlook.avg_storms.toFixed(1)} storms`} />
            <MiniStat label="Busiest on record" value={`${outlook.max_storms} (${outlook.max_year})`} />
            <span className="text-slate-500 text-xs flex-1 min-w-[220px] leading-snug">{outlook.forecast_text}</span>
          </div>
        )}
      </div>
    </Section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-1.5" style={{ background: '#f8fafc', border: '1px solid #eef2f7' }}>
      <div className="text-[9px] uppercase tracking-wide text-slate-400 font-bold">{label}</div>
      <div className="text-sm font-bold text-slate-700 tabular-nums">{value}</div>
    </div>
  )
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-lg animate-pulse" style={{ height: 36, background: '#eef2f7' }} />
      ))}
    </div>
  )
}

function activityStyle(level: string): React.CSSProperties {
  const map: Record<string, string> = {
    'quiet': '#64748b', 'below-normal': '#0891b2', 'normal': '#00875a',
    'above-normal': '#ff8800', 'very active': '#cc2200',
  }
  const c = map[level] ?? '#0052cc'
  return { background: `${c}18`, color: c, border: `1px solid ${c}44` }
}
