# Forecast drift ("is the storm still tracking as predicted?") — design

**Date:** 2026-09-14
**Status:** approved by user, pending spec review gate

## Purpose

Every other forecast feature in this app compares agencies against *each
other* (the multi-model spread score, the uncertainty cone): how much do
forecasters currently disagree. Nothing compares the storm's **actual
current position** against **what our own AI Ensemble forecast said it
would be**, checked back later. That's a different, more concrete signal —
"the forecast we gave you yesterday is holding up" or "the storm has since
drifted from where we said it would be" — and it's a live check on the
model this project owns, not on third-party agencies.

## Scope decisions (already made, not open)

| Decision | Answer | Why |
|---|---|---|
| Anchor forecast | AI Ensemble only | The one track that's always genuinely `live`, never `SIM` — matches the existing honesty invariant (spread/cone only claim confidence from live data; this claim is even stronger, so it gets an even stronger source). |
| Snapshot storage | Client-side (localStorage web / AsyncStorage mobile) | The backend has **no database** — every cache in `app.py` (`live_storms_cache`, `weather_grid_cache`, …) is a plain in-memory dict, and those don't reliably survive between invocations on Vercel's serverless functions anyway. A real backend datastore is new infrastructure, out of scope here. |
| Lookback window | 24 hours | Long enough that a real shift is distinguishable from short-term wobble; short enough to stay relevant; the one unit ("yesterday's forecast for right now") that needs no caveat to explain. |
| Presentation | Text only, in the alert banner | No new map rendering. Reuses the banner components `ParAlerts`/mobile `alerts.tsx` already have. |
| Platforms | Web and mobile | Matches every other feature built in this app so far — mirrored the way `par.ts`/`tcws.ts`/`uncertainty.ts` already are. |

## Architecture

A dedicated hook, `useForecastDrift`, mirroring the shape
`useParBroadcastEngine` already proved out in this codebase: it owns its own
persisted log, runs its own tick, and is fed the same `storms` /
`modelTracks` data the parent (`HurricaneTracker` on web, `useStormData` on
mobile) already has. It does not touch the fetch/render logic already in
those files.

**Deliberate difference from `useParBroadcastEngine`:** that hook only runs
while a storm's PAR status is `inside`. This one runs for **every tracked
storm, regardless of PAR status** — the entire point is an early signal,
and drift matters most days before PAR entry, not after.

```
lib/forecastDrift.ts  (new, mirrored into mobile/lib/)
  — pure functions: snapshot capture eligibility, computeDrift(), wording.
    No React, no storage — same split as lib/uncertainty.ts. Owns the
    public DriftCheck type (what ParAlert consumes), exactly as
    lib/uncertainty.ts owns UncertaintyScore.

hooks/useForecastDrift.ts  (new, mirrored into mobile/hooks/)
  — owns persisted snapshots (localStorage / AsyncStorage, key
    "headsup:forecastDrift:v1" — namespaced like useParBroadcastEngine's
    "headsup:parBroadcast:v1" so the two never collide), the poll tick,
    pruning. Owns the hook-internal ForecastSnapshot type (never exported
    beyond this file — it's a storage shape, not a public result). Thin:
    calls computeDrift() from lib/forecastDrift.ts, returns drift-by-storm.
```

### Data captured

Every ~6 hours (matching `BEST_TRACK_STEP_H`, already used by
`useParBroadcastEngine` for real fixes), snapshot the storm's current AI
Ensemble forecast:

```ts
interface ForecastSnapshot {
  storm: string
  issuedAtUtc: string                              // ISO
  points: Array<{ lat: number; lon: number; hour: number }>
}
```

Snapshots older than ~36 hours are pruned on every write — nothing needs to
look back further than the 24h check plus slack for the tolerance window
below.

### The check

Rather than firing once when a snapshot crosses the 24h mark, **every poll
recomputes drift live** against whichever stored snapshot is closest to 24
hours old, within an 18–30 hour tolerance. When the 6-hourly cadence leaves
more than one snapshot inside that window (e.g. snapshots 18h and 24h old
both qualify), `computeDrift` picks the one whose age is closest to exactly
24h — deterministic, no "first match wins" ambiguity. If no snapshot falls
in the window at all (a storm just started being tracked, or its cadence
hasn't produced one yet), no drift line is shown — silence, not a "no data
yet" placeholder, matching how the uncertainty advice line stays silent
rather than cluttering the banner.

```ts
interface DriftCheck {
  storm: string
  checkedAtUtc: string
  issuedAtUtc: string          // which snapshot this compared against
  leadHours: number            // actual gap between issuedAtUtc and now
  predictedPosition: { lat: number; lon: number }
  actualPosition: { lat: number; lon: number }
  driftKm: number
  heading: string               // 16-point compass, e.g. "N", "ESE"
  level: 'on-track' | 'minor' | 'significant'
  headline: string
}
```

Computation reuses what `lib/uncertainty.ts` already has rather than
duplicating it:

- `interpolateTrackAt(snapshot.points, hoursSinceIssued)` → where that old
  forecast placed the storm right now (`hoursSinceIssued` is the actual
  elapsed time, not assumed to be exactly 24 — a snapshot found at 21h or
  27h old is still valid within the tolerance window).
- `haversineKm(...)` → `driftKm`.
- `bearingDeg(...)` → converted to the same 16-point compass
  `useParBroadcastEngine.computeMovement` already uses, so the wording
  matches the rest of the app: *"85km north of where the forecast issued
  22h ago placed it"* rather than a bare number.

### Thresholds

| driftKm | level | Rationale |
|---|---|---|
| < 40 | `on-track` | Below typical short-term positional noise. |
| 40–100 | `minor` | Above noise, within the ~60–100km typical 24h agency track error for this region — worth a mention, not alarming. |
| > 100 | `significant` | Outside normal forecast error — a real shift, not noise. |

### Wording — including the quiet case

Unlike the spread-advice line (silent unless there's a problem), this one
**always shows a status once a check exists**, because it's the one feature
that's visibly demonstrable without needing an actual drift event to occur:

- `on-track`: *"Tracking within 28km of yesterday's forecast."*
- `minor`: *"Now 65km ESE of where the +22h forecast placed it — minor
  drift."*
- `significant`: *"Now 140km N of where the +23h forecast placed it —
  track has shifted."*

Rendered as a new line on `ParAlert` (web) and mobile's `ParAlert`,
alongside the existing action/advice lines — no new banner component.

```ts
// added to ParAlert (both platforms)
drift: DriftCheck | null
```

## Push notification on drift transitions

Added after initial approval, at the user's request — this pulls the
"push notification on a drift transition" line back in from Out of Scope
below.

**Trigger:** once per storm, per `level` transition — fires when the
computed level differs from the last level notified for that storm, in
*either* direction: escalating (`on-track` → `minor` → `significant`) and
recovering (`significant`/`minor` → `on-track`). The recovering case is
what answers "confirm it's tracking toward the prediction again," not just
"warn when it shifts."

The first-ever check for a storm also notifies (there is no prior level to
differ from) — consistent with the design's "always show a status once a
check exists" wording, and it doubles as the moment a user learns the
feature exists for that storm.

**Not fired on every poll.** The check itself recomputes live every poll
(see above), but a poll that reproduces the *same* level as last time
notifies nobody — only a change in `level` does. Otherwise a storm sitting
at `on-track` for days would notify every ~10 minutes.

**Dedup persists across reloads.** `ParAlerts.tsx`'s existing notification
dedup (`notifiedRef`) is a `useRef<Set<string>>` that resets on every
mount — a page reload re-evaluates current alerts against an empty Set, so
a status a user already saw a notification for can fire again after a
reload. That's a real gap in the existing code, and this feature does not
inherit it: `useForecastDrift` persists `lastNotifiedLevel` per storm
alongside its snapshots in the same storage blob, the same way
`useParBroadcastEngine` persists its packet log specifically so a reload
doesn't re-fire packets already emitted.

**Delivery** reuses the exact plumbing each platform already has — no new
notification mechanism:

- Web: `Notification`, gated on `Notification.permission === 'granted'`,
  exactly as `useParBroadcastEngine` already fires one per 3-hour packet.
  `useForecastDrift` checks permission itself; it does not depend on
  `ParAlerts`' opt-in UI, matching how `useParBroadcastEngine` is
  self-contained today.
- Mobile: `scheduleLocalNotification` from `lib/notifications.ts`, exactly
  as `useStormData.tsx` already uses for PAR escalations and Demo Scenario
  events.

**Title and body**, level-keyed:

| level | Title | Body |
|---|---|---|
| `on-track` | "✅ Forecast holding — `<storm>`" | the existing on-track headline |
| `minor` | "📈 Track drift — `<storm>`" | the existing minor headline |
| `significant` | "⚠️ Track has shifted — `<storm>`" | the existing significant headline |

Body text is exactly `DriftCheck.headline` — no separate notification copy
to keep in sync with the banner line.

## Interaction with the Demo Scenario

The demo replays GONI (2020) by stepping through historical points on a
UI timer (as fast as ~150ms/step), not real wall-clock time. A 24h-old
snapshot will essentially never exist during a demo run — there isn't
enough real time between the hook's poll ticks for one to age in.

This is an accepted limitation, not a bug to paper over: faking a 24h-old
snapshot to make the demo "show off" the feature would contradict the
honesty pattern already established for SIM vs. live data in this app (real
signal only, never a manufactured one). During a demo, the drift line
simply won't appear — same as it wouldn't for a real storm in its first day
of tracking.

## Error handling

- Corrupt or missing localStorage/AsyncStorage data: caught and discarded,
  starting fresh — same `try { JSON.parse(...) } catch { /* start fresh */ }`
  pattern `useParBroadcastEngine.loadPersisted` already uses.
- A poll that returns no forecast for a storm: skip capturing a snapshot
  that cycle; don't crash, don't prune existing history for it.
- A storm that disappears from `storms` between polls (dissipated): its
  snapshots simply age out via the existing 36h prune; no special-case
  cleanup needed.
- Notification permission not granted, or the `Notification`/
  `scheduleLocalNotification` call throws (some mobile browsers throw from
  the constructor): the drift check and banner line are computed and shown
  regardless — notification delivery is a side effect of an already-
  computed result, never a precondition for showing it.

## Testing

Same verification approach as `lib/uncertainty.ts`: a pure module
(`lib/forecastDrift.ts`) with no React or storage, checked with a throwaway
script asserting — a hand-built "on-track" case stays under 40km, a
hand-built "significant" case exceeds 100km and reports the correct compass
heading, a snapshot outside the 18–30h tolerance window is ignored, pruning
removes snapshots older than 36h, and corrupt persisted state is recovered
from rather than thrown.

The transition-notification logic gets its own fixtures, separate from the
pure drift computation: two consecutive same-level checks produce no
notification, a level change in either direction produces exactly one, a
storm's first-ever check produces one, and `lastNotifiedLevel` read back
after a simulated reload matches what was persisted (proving the reload
gap in `ParAlerts.tsx`'s existing dedup is not repeated here).

## Out of scope for this pass

- Map annotation (predicted-point vs. actual-point marker/arrow) — text
  only, per the presentation decision above. The data model doesn't block
  adding this later.
- Multiple lookback checkpoints (12h/24h/48h at once) — 24h only.
- Any backend-side storage or verification.
