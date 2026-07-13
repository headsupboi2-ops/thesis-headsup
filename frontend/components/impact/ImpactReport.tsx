'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin, Home, Navigation, Clock, AlertTriangle, ShieldCheck } from 'lucide-react'
import { fetchRealtimeStorms } from '@/lib/analytics'
import { API_BASE } from '@/lib/constants'
import type { MultiModelResponse } from '@/lib/forecastModels'
import { PH_CITIES, DEFAULT_CITY, type City } from '@/lib/cities'
import { computeImpact, mostThreatening, riskMeta, type Impact, type ModelLite } from '@/lib/impact'
import { prepTimeline } from '@/lib/prep'

export function ImpactReport() {
  const [city, setCity] = useState<City>(DEFAULT_CITY)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setStatus('loading')
      try {
        const storms = (await fetchRealtimeStorms()).storms ?? []
        if (!storms.length) { if (!cancelled) { setImpact(null); setStatus('done') } return }
        const impacts: Impact[] = []
        for (const s of storms) {
          try {
            const history = s.path?.length ? s.path.slice(-16) : [{ lat: s.lat, lon: s.lon }]
            const res = await fetch(`${API_BASE}/api/multi-model-tracks`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
              body: JSON.stringify({ storm_name: s.name, track_history: history }),
            })
            if (!res.ok) continue
            const data: MultiModelResponse = await res.json()
            const models: ModelLite[] = data.models.map(m => ({ model: m.model, label: m.label, color: m.color, source: m.source, points: m.points }))
            const imp = computeImpact(s.name, models, city.lat, city.lon, Math.round(s.wind_speed))
            if (imp) impacts.push(imp)
          } catch { /* skip storm */ }
        }
        if (!cancelled) { setImpact(mostThreatening(impacts)); setStatus('done') }
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [city])

  return (
    <div className="h-screen overflow-y-auto" style={{ background: '#0a1a3a' }}>
      {/* top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-6"
        style={{ height: 56, background: 'rgba(255,255,255,0.97)', borderBottom: '3px solid #0052cc', boxShadow: '0 2px 12px rgba(0,40,100,0.12)' }}>
        <Link href="/" className="flex items-center gap-1.5 text-[#0052cc] hover:text-blue-700 text-xs font-bold">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex items-center gap-2.5">
          <Home className="w-6 h-6 text-[#0052cc]" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-extrabold text-slate-800 tracking-tight">My Area — Will it hit me?</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-widest">Personal impact from the 10-model ensemble</span>
          </div>
        </div>
        {/* city picker */}
        <label className="ml-auto flex items-center gap-2 text-slate-500 text-xs font-semibold">
          <MapPin size={14} className="text-[#0052cc]" />
          <select
            value={`${city.name}|${city.province}`}
            onChange={e => { const [n, p] = e.target.value.split('|'); const c = PH_CITIES.find(x => x.name === n && x.province === p); if (c) setCity(c) }}
            className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-bold outline-none">
            {PH_CITIES.map(c => <option key={`${c.name}|${c.province}`} value={`${c.name}|${c.province}`}>{c.name}, {c.province}</option>)}
          </select>
        </label>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-5 pb-16">
        {status === 'loading' && <Panel><div className="py-8 text-center text-slate-400 text-sm">Checking storms near {city.name}…</div></Panel>}
        {status === 'error' && <div className="rounded-xl px-4 py-3 text-white text-sm font-semibold" style={{ background: 'linear-gradient(90deg,#a8210e,#cc2200)' }}>⚠ Couldn&apos;t load the forecast for {city.name}. Check the backend.</div>}

        {status === 'done' && (!impact || impact.level === 'clear')
          ? <CalmCard city={city.name} hasStorms={impact != null} closest={impact?.closestKm} />
          : impact && (
            <>
              <RiskHero impact={impact} city={city.name} />
              <MetricsRow impact={impact} />
              <PrepSection impact={impact} />
              <ModelAgreement impact={impact} />
            </>
          )}
      </main>
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(0,82,204,0.13)', boxShadow: '0 8px 32px rgba(0,40,100,0.14)' }}>
      {children}
    </div>
  )
}

function RiskHero({ impact, city }: { impact: Impact; city: string }) {
  const meta = riskMeta(impact.level)
  const pct = Math.round(impact.strikeProbability * 100)
  const size = 168, stroke = 14, r = (size - stroke) / 2, C = 2 * Math.PI * r
  const headline =
    impact.level === 'high' ? `${impact.storm} is likely to affect ${city}`
    : impact.level === 'moderate' ? `${impact.storm} may affect ${city}`
    : `${impact.storm} is being watched near ${city}`
  return (
    <Panel>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
            <circle cx={size / 2} cy={size / 2} r={r} stroke={meta.color} strokeWidth={stroke} fill="none"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - impact.strikeProbability)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-extrabold leading-none" style={{ color: meta.color, fontSize: 44 }}>{pct}<span className="text-xl">%</span></span>
            <span className="text-[11px] text-slate-400 -mt-0.5">chance of impact</span>
          </div>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <span className="text-[11px] font-black tracking-widest" style={{ color: meta.color }}>{meta.word.toUpperCase()}</span>
          <h2 className="text-slate-800 font-extrabold text-lg leading-snug mt-1">{headline}</h2>
          <p className="text-slate-500 text-sm mt-1.5">{impact.striking} of {impact.total} forecast models bring it within 100 km of {city}.</p>
        </div>
      </div>
    </Panel>
  )
}

function MetricsRow({ impact }: { impact: Impact }) {
  const eta = impact.etaEarliest
  const etaText = eta == null ? '—' : eta < 24 ? `~${eta}h` : `~${Math.floor(eta / 24)}d ${eta % 24}h`
  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric icon={<Navigation size={15} />} label="Closest approach" value={`${impact.closestKm} km`} />
      <Metric icon={<Clock size={15} />} label="Arrives in" value={etaText} />
      <Metric icon={<AlertTriangle size={15} />} label="Expected signal" value={impact.tcws?.short ?? '—'} color={impact.tcws?.color} />
    </div>
  )
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(0,82,204,0.13)' }}>
      <div className="flex items-center gap-1.5 text-[#0052cc]" style={{ color: color ?? '#0052cc' }}>{icon}
        <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="font-extrabold text-slate-800 text-lg mt-1" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}

function PrepSection({ impact }: { impact: Impact }) {
  const items = prepTimeline(impact.tcws?.signal ?? 0, impact.etaEarliest)
  if (!items.length) return null
  return (
    <Panel>
      <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-slate-400 mb-1">Prepare by</p>
      {impact.tcws && (
        <p className="text-slate-500 text-sm mb-3">Expecting <b style={{ color: impact.tcws.color }}>{impact.tcws.short}</b> · {impact.tcws.label}. Do these in order:</p>
      )}
      <ol className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2"
            style={{ background: it.overdue ? 'rgba(204,34,0,0.06)' : '#f8fafc', border: `1px solid ${it.overdue ? 'rgba(204,34,0,0.3)' : '#eef2f7'}` }}>
            <span className="mt-0.5" style={{ color: it.overdue ? '#cc2200' : '#0052cc' }}>•</span>
            <div className="flex-1">
              <div className="text-slate-700 text-sm font-semibold leading-snug">{it.label}</div>
              <div className="text-[11px] font-bold mt-0.5" style={{ color: it.overdue ? '#cc2200' : '#94a3b8' }}>
                {it.overdue ? 'Do this now' : `by ${it.by.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · in ${it.hoursToGo}h`}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function ModelAgreement({ impact }: { impact: Impact }) {
  const sorted = [...impact.perModel].sort((a, b) => a.distanceKm - b.distanceKm)
  return (
    <Panel>
      <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-slate-400 mb-2">Model agreement</p>
      <div className="flex flex-col gap-1.5">
        {sorted.map(m => (
          <div key={m.model} className="flex items-center gap-2.5 text-sm">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color, display: 'inline-block' }} />
            <span className="flex-1 font-semibold text-slate-600">{m.model.replace('_', ' ')}</span>
            <span className="font-bold tabular-nums" style={{ color: m.distanceKm <= 100 ? '#ff8800' : '#94a3b8' }}>{m.distanceKm} km</span>
            <span className="text-[9px] font-extrabold w-8 text-right"
              style={{ color: m.source === 'live' ? '#00875a' : '#94a3b8' }}>{m.source === 'live' ? 'LIVE' : 'SIM'}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function CalmCard({ city, hasStorms, closest }: { city: string; hasStorms: boolean; closest?: number }) {
  return (
    <Panel>
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,135,90,0.12)' }}>
          <ShieldCheck size={30} className="text-[#00875a]" />
        </div>
        <div>
          <span className="text-[11px] font-black tracking-widest text-[#00875a]">ALL CLEAR</span>
          <h2 className="text-slate-800 font-extrabold text-lg mt-1">No storm threatens {city}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {hasStorms
              ? `The nearest active storm stays ${closest != null ? `~${closest} km` : 'well'} away. You're safe for now.`
              : 'No active storms in the Western Pacific right now.'}
          </p>
        </div>
      </div>
    </Panel>
  )
}
