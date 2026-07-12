'use client'
import type { ReactNode } from 'react'

/**
 * KPI stat tile — a hero figure with a label and optional sublabel/accent.
 * Value stays in ink (text token), never a series color. Proportional figures
 * for the big number (tabular only in aligned columns).
 */
export function StatTile({
  label, value, unit, sublabel, accent = '#0052cc', icon,
}: {
  label: string
  value: string
  unit?: string
  sublabel?: string
  accent?: string
  icon?: ReactNode
}) {
  return (
    <div
      className="flex flex-col justify-between rounded-xl px-4 py-3.5"
      style={{
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid rgba(0,82,204,0.13)',
        boxShadow: '0 4px 18px rgba(0,40,100,0.08)',
        minHeight: 104,
      }}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span style={{ color: accent }}>{icon}</span>}
        <span className="text-[10px] font-bold uppercase tracking-[1.1px] text-slate-400">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-slate-900 font-semibold leading-none" style={{ fontSize: 30 }}>
          {value}
        </span>
        {unit && <span className="text-slate-400 text-sm font-semibold">{unit}</span>}
      </div>
      {sublabel && (
        <span className="text-[11px] text-slate-500 mt-1 leading-tight">{sublabel}</span>
      )}
    </div>
  )
}
