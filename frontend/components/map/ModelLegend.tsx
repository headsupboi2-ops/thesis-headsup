'use client'
import { useState } from 'react'
import { useDashboard } from '@/hooks/useDashboardState'
import {
  ALL_MODEL_IDS, MODEL_META, MODEL_COLORS,
  type ForecastModelId, type ModelTrack,
} from '@/lib/forecastModels'

/**
 * Toggleable legend for the 10-agency multi-model ensemble tracks.
 * `tracks` is every fetched ModelTrack (all storms) — used to badge each
 * model LIVE (real agency feed) vs SIM (deterministic mock fallback).
 */
export function ModelLegend({ tracks }: { tracks: ModelTrack[] }) {
  const { state, toggleModel, setEnabledModels } = useDashboard()
  const { enabledModels } = state
  const [collapsed, setCollapsed] = useState(false)

  // A model is LIVE if any storm got a real feed for it
  const sourceByModel = new Map<ForecastModelId, 'live' | 'mock'>()
  for (const t of tracks) {
    if (sourceByModel.get(t.model) !== 'live') sourceByModel.set(t.model, t.source)
  }

  return (
    <div className="fixed z-[850] text-white"
      style={{
        bottom: 130, left: 16, width: 178,
        background: 'rgba(10,16,28,0.88)', borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.12)',
        fontSize: 11,
      }}>
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
        <span className="font-bold tracking-wide" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Forecast Models
        </span>
        <button onClick={() => setCollapsed(c => !c)}
          style={{ background: 'none', border: 'none', color: '#9ab', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
          aria-label={collapsed ? 'Expand model legend' : 'Collapse model legend'}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="flex gap-1 px-3 pt-2">
            {([['All', ALL_MODEL_IDS], ['None', [] as ForecastModelId[]]] as const).map(([label, models]) => (
              <button key={label} onClick={() => setEnabledModels([...models])}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.08)', color: '#cde',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
                  padding: '2px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}>
                {label}
              </button>
            ))}
          </div>

          <div className="px-2 py-2 flex flex-col gap-0.5">
            {ALL_MODEL_IDS.map(id => {
              const enabled = enabledModels.includes(id)
              const source = sourceByModel.get(id)
              return (
                <button key={id} onClick={() => toggleModel(id)}
                  title={MODEL_META[id].agency}
                  className="flex items-center gap-2 px-1.5 py-[3px] rounded"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: enabled ? 'white' : 'rgba(255,255,255,0.35)',
                    textAlign: 'left',
                  }}>
                  {/* line swatch — dashed when simulated */}
                  <svg width="20" height="6" style={{ flexShrink: 0, opacity: enabled ? 1 : 0.35 }}>
                    <line x1="0" y1="3" x2="20" y2="3" stroke={MODEL_COLORS[id]} strokeWidth="2.5"
                      strokeDasharray={source === 'mock' ? '3 3' : undefined} />
                  </svg>
                  <span className="flex-1 font-semibold" style={{ fontSize: 10.5 }}>{MODEL_META[id].label}</span>
                  {source && (
                    <span style={{
                      fontSize: 8, fontWeight: 800, letterSpacing: 0.5,
                      padding: '1px 4px', borderRadius: 3,
                      background: source === 'live' ? 'rgba(40,180,80,0.25)' : 'rgba(255,255,255,0.1)',
                      color: source === 'live' ? '#5f6' : '#aab',
                    }}>
                      {source === 'live' ? 'LIVE' : 'SIM'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
