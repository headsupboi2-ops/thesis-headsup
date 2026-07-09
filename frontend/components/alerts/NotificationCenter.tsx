'use client'
import { useEffect, useRef, useState } from 'react'
import { CONSENSUS_TEXT, type BroadcastPacket } from '@/hooks/useParBroadcastEngine'

/** Short two-tone WebAudio chirp — no asset file needed. */
function playAlertChirp() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18)
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => ctx.close()
  } catch { /* audio blocked or unsupported — silent fallback */ }
}

function PacketDetails({ p }: { p: BroadcastPacket }) {
  return (
    <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-300">
      <div>📍 {p.position.lat.toFixed(1)}°N {p.position.lon.toFixed(1)}°E · Cat {p.category} · {p.windKt} kt</div>
      {p.movement && <div>🧭 Moving {p.movement.heading} at {p.movement.speedKmh} km/h</div>}
      {p.tcws && <div className="font-semibold text-amber-300">🚩 {p.tcws.label}</div>}
      {p.consensus && (
        <div>
          🎯 10-model consensus: {p.consensus.entering}/{p.consensus.total} tracks in PAR,
          spread ±{p.consensus.spreadKm} km at +48 h
          {p.consensusChange && (
            <span className={
              p.consensusChange === 'narrowed' ? ' text-emerald-300' :
              p.consensusChange === 'steady' ? ' text-slate-400' : ' text-orange-300'
            }>
              {' '}— {CONSENSUS_TEXT[p.consensusChange]}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Slide-out Notification Center + 3-hour toast.
 * The timeline groups packets per storm in reverse-chronological order;
 * each "Hour N" entry expands to show how the storm changed over time.
 */
export function NotificationCenter({
  log, toast, onDismissToast, onClearLog,
}: {
  log: BroadcastPacket[]
  toast: BroadcastPacket | null
  onDismissToast: () => void
  onClearLog: () => void
}) {
  const [open, setOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [seenCount, setSeenCount] = useState(0)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  // Audio cue + auto-dismiss whenever a new 3-hour packet lands
  const lastToastId = useRef<string | null>(null)
  useEffect(() => {
    if (!toast || toast.id === lastToastId.current) return
    lastToastId.current = toast.id
    if (soundRef.current) playAlertChirp()
    const t = setTimeout(onDismissToast, 15_000)
    return () => clearTimeout(t)
  }, [toast, onDismissToast])

  const unread = Math.max(0, log.length - seenCount)
  const toggleExpanded = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  // Group packets by storm, newest storm activity first
  const byStorm: Record<string, BroadcastPacket[]> = {}
  const stormOrder: string[] = []
  for (const p of log) {
    if (!byStorm[p.storm]) { byStorm[p.storm] = []; stormOrder.push(p.storm) }
    byStorm[p.storm].push(p)
  }

  return (
    <>
      {/* ── Bell toggle (hidden while the panel is open — panel has its own ✕) ── */}
      {!open && <button
        onClick={() => { setOpen(true); setSeenCount(log.length) }}
        aria-label="Open notification center"
        className="fixed z-[955] flex items-center justify-center w-9 h-9 rounded-full
                   bg-slate-900/90 border border-white/20 text-base shadow-lg
                   hover:bg-slate-800 cursor-pointer"
        style={{ top: 64, right: 200 }}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600
                           text-white text-[9px] font-extrabold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>}

      {/* ── Slide-out panel ── */}
      <div
        className={`fixed z-[950] top-[52px] bottom-0 right-0 w-80 flex flex-col
                    bg-slate-950/95 backdrop-blur-md border-l border-white/15 shadow-2xl
                    transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <span className="flex-1 text-white text-xs font-bold uppercase tracking-widest">
            PAR Broadcast Log
          </span>
          <button onClick={() => setSoundOn(s => !s)}
            title={soundOn ? 'Mute audio cue' : 'Unmute audio cue'}
            className="text-sm cursor-pointer bg-transparent border-none">
            {soundOn ? '🔊' : '🔇'}
          </button>
          {log.length > 0 && (
            <button onClick={onClearLog}
              className="text-[10px] font-bold text-slate-400 hover:text-white cursor-pointer
                         bg-transparent border-none uppercase">
              Clear
            </button>
          )}
          <button onClick={() => setOpen(false)} aria-label="Close notification center"
            className="text-slate-400 hover:text-white text-sm cursor-pointer bg-transparent border-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {log.length === 0 && (
            <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-2">
              No PAR broadcasts yet. The 3-hour update loop starts automatically
              the moment a typhoon <b className="text-slate-200">enters the PAR</b> and
              stops when it leaves or dissipates.
            </p>
          )}

          {stormOrder.map(storm => (
            <div key={storm}>
              <div className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest mb-1.5 px-1">
                🌀 {storm}
              </div>
              {/* Reverse-chronological timeline */}
              <ol className="relative border-l border-white/15 ml-2 space-y-2">
                {byStorm[storm].map(p => {
                  const isOpen = expanded.has(p.id)
                  return (
                    <li key={p.id} className="ml-3">
                      <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-red-500
                                       border border-slate-950" />
                      <button
                        onClick={() => toggleExpanded(p.id)}
                        className="w-full text-left rounded-lg bg-white/5 hover:bg-white/10 px-2.5 py-2
                                   cursor-pointer border border-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-white text-[11px] font-bold">
                            Hour {p.hoursElapsed}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {p.issuedAtUtc.slice(11, 16)} UTC · {p.localTime} local
                          </span>
                          <span className="ml-auto text-slate-400 text-[10px]">{isOpen ? '▾' : '▸'}</span>
                        </div>
                        {isOpen && <PacketDetails p={p} />}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom-right toast for each new 3-hour packet ── */}
      {toast && (
        <div
          role="status"
          className="fixed z-[960] bottom-[90px] right-4 max-w-sm rounded-xl overflow-hidden
                     bg-slate-900/95 backdrop-blur border border-red-500/40 shadow-2xl
                     animate-[slideIn_.3s_ease-out]"
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-red-700/80">
            <span className="text-white text-[11px] font-extrabold uppercase tracking-wide">
              Hour {toast.hoursElapsed} Update inside PAR — {toast.storm}
            </span>
            <button onClick={onDismissToast} aria-label="Dismiss update toast"
              className="ml-auto text-white/80 hover:text-white text-xs cursor-pointer bg-transparent border-none">
              ✕
            </button>
          </div>
          <div className="px-3 py-2 text-slate-200 text-[11px] leading-relaxed">
            {toast.headline}
            <button
              onClick={() => { setOpen(true); setSeenCount(log.length); onDismissToast() }}
              className="block mt-1.5 text-sky-400 hover:text-sky-300 text-[10px] font-bold
                         cursor-pointer bg-transparent border-none p-0"
            >
              View full timeline →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
