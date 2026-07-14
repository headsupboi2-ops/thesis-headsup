# Flood & Storm-Surge Risk — Methodology

HeadsUp's *My Area* and the *Flood Risk* map layer report a **flood-potential
index** and a **storm-surge risk index** for a chosen location (barangay-level
for Naga City, city-level elsewhere). This document states exactly what those
numbers are, how they are computed, and — importantly for evaluation — what they
are **not**.

## 1. Scope and honest framing

These outputs are a **risk index**, not a hydrodynamic flood or surge
simulation. They estimate *how likely and how severe* rainfall flooding or
coastal surge is at a location, and *when*, from:

- **forecast rainfall** (the same 7-day hourly grid the map overlays use), and
- **local flood susceptibility / coastal exposure** (curated hazard geography), and
- for surge, the **threatening storm's intensity and closest approach**.

There is **no digital elevation model, hydrological routing, drainage capacity,
river-stage, or bathymetry** in the model. It therefore cannot output flood
*depth* or a surge *height* at a point — only a graded risk level with an
approximate band. This is stated in the UI on every surface
("*Risk index from forecast rainfall × local flood susceptibility (PAGASA
thresholds). Not a surveyed flood map.*").

## 2. Flood Potential Index

For a location, over each forecast day *d* (0–6):

```
rainAccum(d)  = Σ hourly forecast rainfall (mm) over the 24 h of day d,
                inverse-distance interpolated from the PAR weather grid
peakRain      = max over d of rainAccum(d)          # the worst forecast day
rainScore     = clamp01(peakRain / 220)             # 220 mm/24 h ≈ index ceiling
score         = clamp01(rainScore × (0.55 + 0.9 × susceptibility))
level         = severe  (score ≥ 0.70)
                high     (≥ 0.50)
                moderate (≥ 0.30)
                low      (≥ 0.12)
                minimal  (otherwise)
```

- **Rainfall thresholds** are anchored to **PAGASA's 24-hour heavy-rainfall
  guidance** — Yellow ≈ 50 mm, Orange ≈ 100 mm, Red ≈ 200 mm within 24 h — so
  the index moves with recognised advisory magnitudes rather than an arbitrary
  scale.
- **Susceptibility (0–1)** scales the rainfall response: a floodplain (~0.85)
  amplifies a given rainfall toward flooding; upland terrain (~0.15) sheds it.
  The multiplier range `0.55 … 1.45` means the *same* rain can differ by roughly
  one risk level between a riverside and an upland barangay — which is the
  hyperlocal signal Windy and generic viewers do not provide.

The **map layer** applies the same idea per grid cell. On mobile it uses a
**trailing-24 h** rainfall window ending at the scrubbed forecast hour × the
cell's susceptibility, scored 0–100; on web it uses instantaneous rainfall
intensity × susceptibility (the web grid carries the current-hour value rather
than the full hourly array). Both are the same index, sampled differently.

## 3. Storm-Surge Risk

Surge is evaluated **only for coastal locations** (`coastalExposure` ≠ `none`).
Inland locations — including **Naga City (~20 km from San Miguel Bay)** — return
`none`.

```
if exposure == none or peakWind < 34 kt or closestKm > 300:  surge = none
baseM  = f(peak wind near closest approach)     # TS≈1 m, Cat1≈2, Cat2≈3, Cat3≈4, Cat4≈5, Cat5≈6
expF   = open coast 1.0 | bay 0.6
distF  = ≤50 km 1.0 | ≤120 km 0.7 | else 0.4
m      = baseM × expF × distF                   # approximate surge height (m)
level  = high (m ≥ 3) | moderate (≥ 1.5) | low (≥ 0.5) | none
band   = height range around m (e.g. "2–3 m")
```

The intensity→height mapping follows the **order of magnitude of PAGASA's
storm-surge advisories** by signal/intensity. It is a first-order estimate, not
a SLOSH/coupled surge model.

## 4. Susceptibility data and its provenance

Per-barangay and per-region susceptibility values live in `lib/hazard.ts`
(duplicated in `mobile/lib` and `frontend/lib`). The **current** ratings are
derived from **hydrogeographic reasoning**, not yet from an ingested official
raster:

- proximity to the **Naga River** and the wider **Bicol River basin**,
- **low-lying central/western** barangays vs the **eastern Mt-Isarog uplands**,
- barangays with **documented recurrent flooding** (e.g. Triangulo, Tabuco,
  Mabolo, Dinaga, Sabang) rated highest.

**To strengthen this for the thesis**, replace the estimated values with a
recognised source and cite it per area:

- **Project NOAH / UP NOAH** flood-hazard maps (5-/25-/100-year),
- **MGB** (Mines and Geosciences Bureau) flood-susceptibility maps,
- **Naga City DRRMO / CLUP** hazard maps.

Each `HazardArea` already carries a `note`; add a `source` field and set each
barangay's `floodSusceptibility` to the class read off the official map
(e.g. Low = 0.25, Moderate = 0.55, High = 0.85). No other code changes are
required — the index consumes whatever values `hazard.ts` provides.

## 5. Limitations (state these explicitly in the writeup)

1. No terrain/elevation, drainage, or river-stage modelling — susceptibility is
   a static curated proxy.
2. Rainfall skill is bounded by the forecast grid's own skill and resolution.
3. Susceptibility values are currently estimated (Section 4) pending official
   ingestion.
4. Surge is a magnitude estimate, not a coastal inundation model.

## 6. Suggested validation

- **Face validity:** confirm the barangay ranking matches lived experience and
  the official hazard map (riverside > upland).
- **Event hindcast:** for a past Bicol typhoon with heavy rain, check that the
  index would have flagged the barangays that actually flooded.
- **Sensitivity:** vary the 220 mm ceiling and the susceptibility multiplier and
  report how levels shift.

---

*Implementation: `lib/hazard.ts`, `lib/flood.ts`, `lib/surge.ts` (pure,
unit-checked). Surfaces: My Area (web `components/impact/ImpactReport.tsx`,
mobile `app/(tabs)/my-area.tsx`) and the Flood Risk map layer.*
