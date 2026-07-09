"""
Multi-model (10-agency) tropical cyclone forecast track aggregation.

Exposes get_multi_model_tracks(payload) used by /api/multi-model-tracks.

For each of the 10 supported models we try a real, free, public data feed
first (JMA / PAGASA / JTWC / HKO / CMA / CWB adapters below). Any model whose
feed is unavailable, unparseable, or has no matching storm falls back to the
deterministic mock ensemble generator, and the returned track is tagged
source='mock' so the UI can badge it as simulated. AI_ENSEMBLE is our own
in-house forecast (scripts.ai_models.run_forecast) and is always 'live'.

All tracks are normalized to:
    {model, label, agency, color, source, points: [{lat, lon, hour, wind_kt}],
     geojson: <GeoJSON Feature<LineString>>}
"""
import logging
import math
import os
import random
import re as _re
import threading
import time
import xml.etree.ElementTree as _ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

HDRS = {'User-Agent': 'StormForecastingApp/1.0'}
FORECAST_HOURS = list(range(0, 126, 6))   # 0..120h every 6h
CACHE_TTL = 600                            # 10 minutes

# ── Model registry (ids must match frontend lib/forecastModels.ts) ─────────
MODELS = {
    'PAGASA':      {'label': 'PAGASA',      'agency': 'Philippine Atmospheric, Geophysical and Astronomical Services Administration', 'color': '#FF3B30'},
    'JTWC':        {'label': 'JTWC',        'agency': 'Joint Typhoon Warning Center (US)',        'color': '#34C759'},
    'JMA':         {'label': 'JMA',         'agency': 'Japan Meteorological Agency (RSMC Tokyo)', 'color': '#007AFF'},
    'ECMWF':       {'label': 'ECMWF',       'agency': 'European Centre for Medium-Range Weather Forecasts', 'color': '#AF52DE'},
    'GFS':         {'label': 'NCEP/GFS',    'agency': 'US NCEP Global Forecast System',           'color': '#FF9500'},
    'CWB':         {'label': 'CWA (Taiwan)','agency': 'Central Weather Administration, Taiwan',   'color': '#5AC8FA'},
    'HKO':         {'label': 'HKO',         'agency': 'Hong Kong Observatory',                    'color': '#FFD60A'},
    'CMA':         {'label': 'CMA',         'agency': 'China Meteorological Administration',      'color': '#FF2D55'},
    'UKMO':        {'label': 'UKMO',        'agency': 'UK Met Office Unified Model',              'color': '#00C7BE'},
    'AI_ENSEMBLE': {'label': 'AI Ensemble', 'agency': 'HeadsUp in-house LSTM + physics model',    'color': '#FFFFFF'},
}
MODEL_ORDER = ['PAGASA', 'JTWC', 'JMA', 'ECMWF', 'GFS', 'CWB', 'HKO', 'CMA', 'UKMO', 'AI_ENSEMBLE']

_cache = {}
_cache_lock = threading.Lock()


# ── Helpers ─────────────────────────────────────────────────────────────────
def _hours_from_now(dt):
    """Signed hours between dt (aware or naive-UTC) and now, rounded to 1h."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return round((dt - datetime.now(timezone.utc)).total_seconds() / 3600.0)


def _parse_time_guess(val):
    """Parse common ISO-ish / compact timestamps used by agency feeds."""
    s = str(val).strip()
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M%z', '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%dT%H:%M:%SZ', '%Y%m%d%H%M', '%Y%m%d%H'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _clean_points(points):
    """Sort by hour, drop out-of-basin / past points, dedupe hours."""
    out, seen = [], set()
    for p in sorted(points, key=lambda x: x['hour']):
        if p['hour'] < 0 or p['hour'] > 168 or p['hour'] in seen:
            continue
        if not (0 <= p['lat'] <= 50 and 90 <= p['lon'] <= 185):
            continue
        seen.add(p['hour'])
        out.append({'lat': round(float(p['lat']), 3), 'lon': round(float(p['lon']), 3),
                    'hour': int(p['hour']),
                    'wind_kt': round(float(p['wind_kt']), 1) if p.get('wind_kt') is not None else None})
    return out if len(out) >= 2 else None


def normalize_model_track(points, model_id, source):
    """Normalize raw adapter output into the unified track dict + GeoJSON LineString."""
    meta = MODELS[model_id]
    return {
        'model': model_id,
        'label': meta['label'],
        'agency': meta['agency'],
        'color': meta['color'],
        'source': source,                       # 'live' | 'mock'
        'points': points,
        'geojson': {
            'type': 'Feature',
            'properties': {'model': model_id, 'color': meta['color'], 'source': source},
            'geometry': {
                'type': 'LineString',
                'coordinates': [[p['lon'], p['lat']] for p in points],
            },
        },
    }


# ── Real-feed adapters (each returns points list or None) ───────────────────
def _fetch_jma(storm_name):
    """JMA bosai typhoon JSON — forecast positions when present."""
    r = requests.get('https://www.jma.go.jp/bosai/typhoon/data/current_information.json',
                     timeout=10, headers=HDRS)
    r.raise_for_status()
    data = r.json()
    tc_list = data if isinstance(data, list) else data.get('TyphoonList', data.get('cyclones', []))
    for tc in tc_list:
        name = str(tc.get('name', tc.get('Name', ''))).upper().strip()
        if name != storm_name.upper():
            continue
        for key in ('ForecastInfo', 'forecast', 'ForecastList', 'forecasts', 'forecastPoints'):
            fc = tc.get(key)
            if not isinstance(fc, list):
                continue
            pts = []
            for f in fc:
                if not isinstance(f, dict):
                    continue
                try:
                    lat = float(f.get('lat', f.get('Lat')))
                    lon = float(f.get('lon', f.get('Lon')))
                except (TypeError, ValueError):
                    continue
                hour = f.get('tau', f.get('hour'))
                if hour is None:
                    dt = _parse_time_guess(f.get('validtime', f.get('ValidTime', '')))
                    hour = _hours_from_now(dt) if dt else None
                if hour is None:
                    continue
                wind = f.get('wind', f.get('Wind'))
                pts.append({'lat': lat, 'lon': lon, 'hour': int(hour),
                            'wind_kt': float(wind) if wind is not None else None})
            cleaned = _clean_points(pts)
            if cleaned:
                return cleaned
    return None


def _fetch_pagasa(storm_name):
    """PAGASA public bulletin JSON — forecast positions when present."""
    r = requests.get('https://pubfiles.pagasa.dost.gov.ph/tamss/weather/bulletin.json',
                     timeout=10, headers=HDRS)
    r.raise_for_status()
    data = r.json()
    items = data if isinstance(data, list) else data.get('data', data.get('storms', [data]))
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get('name', item.get('ph_name', ''))).upper()
        if storm_name.upper() not in name and name not in storm_name.upper():
            continue
        for key in ('forecast_positions', 'forecast', 'forecastPositions', 'track_forecast'):
            fc = item.get(key)
            if not isinstance(fc, list):
                continue
            pts = []
            for f in fc:
                if not isinstance(f, dict):
                    continue
                try:
                    lat = float(f.get('lat', f.get('latitude')))
                    lon = float(f.get('lon', f.get('longitude')))
                except (TypeError, ValueError):
                    continue
                hour = f.get('hour', f.get('tau', f.get('forecast_hour')))
                if hour is None:
                    dt = _parse_time_guess(f.get('valid_at', f.get('datetime', '')))
                    hour = _hours_from_now(dt) if dt else None
                if hour is None:
                    continue
                wind = f.get('wind_speed', f.get('max_wind'))
                pts.append({'lat': lat, 'lon': lon, 'hour': int(hour),
                            'wind_kt': float(wind) if wind is not None else None})
            cleaned = _clean_points(pts)
            if cleaned:
                return cleaned
    return None


def _fetch_jtwc(storm_name):
    """JTWC RSS → linked warning text → parse 'NN HRS, VALID AT' forecast fixes."""
    r = requests.get('https://www.metoc.navy.mil/jtwc/rss/jtwc.rss', timeout=12, headers=HDRS)
    r.raise_for_status()
    root = _ET.fromstring(r.content)
    for item in root.findall('.//item'):
        desc = (item.findtext('description') or '')
        names = _re.findall(r'\(([A-Z]{3,})\)', desc)
        txt_urls = _re.findall(r"href='([^']+web\.txt)'", desc)
        for name_raw, txt_url in zip(names, txt_urls):
            if name_raw.upper().strip() != storm_name.upper():
                continue
            tr = requests.get(txt_url, timeout=8, headers=HDRS)
            tr.raise_for_status()
            txt = tr.text
            pts = []
            # e.g. "72 HRS, VALID AT:\n 091200Z --- 18.3N 125.7E\n MAX SUSTAINED WINDS - 095 KT"
            for m in _re.finditer(
                    r'(\d{1,3})\s*HRS?,\s*VALID AT:\s*\S*\s*---?\s*'
                    r'(\d{1,2}\.\d)\s*N\s+(\d{2,3}\.\d)\s*E'
                    r'(?:.{0,120}?MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT)?',
                    txt, _re.S):
                pts.append({'lat': float(m.group(2)), 'lon': float(m.group(3)),
                            'hour': int(m.group(1)),
                            'wind_kt': float(m.group(4)) if m.group(4) else None})
            cleaned = _clean_points(pts)
            if cleaned:
                return cleaned
    return None


def _fetch_hko(storm_name):
    """HKO open-data TC track feed — best-effort, structure varies."""
    r = requests.get('https://data.weather.gov.hk/weatherAPI/opendata/tcTrack.php?dataType=json',
                     timeout=10, headers=HDRS)
    r.raise_for_status()
    data = r.json()
    cyclones = data.get('tropicalCyclones', data.get('tcList', data if isinstance(data, list) else []))
    for tc in cyclones:
        if not isinstance(tc, dict):
            continue
        name = str(tc.get('name', tc.get('tcName', ''))).upper()
        if storm_name.upper() not in name:
            continue
        pts = []
        for f in tc.get('forecastTrack', tc.get('forecast', [])):
            if not isinstance(f, dict):
                continue
            try:
                lat = float(f.get('lat', f.get('latitude')))
                lon = float(f.get('lon', f.get('longitude')))
            except (TypeError, ValueError):
                continue
            hour = f.get('tau', f.get('hour'))
            if hour is None:
                dt = _parse_time_guess(f.get('time', f.get('validTime', '')))
                hour = _hours_from_now(dt) if dt else None
            if hour is None:
                continue
            wind = f.get('maxWind', f.get('wind'))
            pts.append({'lat': lat, 'lon': lon, 'hour': int(hour),
                        'wind_kt': float(wind) if wind is not None else None})
        cleaned = _clean_points(pts)
        if cleaned:
            return cleaned
    return None


def _fetch_cma(storm_name):
    """CMA typhoon.nmc.cn public JSON (unofficial) — forecast by 'BABJ' agency."""
    r = requests.get('http://typhoon.nmc.cn/weatherservice/typhon/jsons/list_default',
                     timeout=10, headers=HDRS)
    r.raise_for_status()
    m = _re.search(r'\((\{.*\})\)', r.text, _re.S)   # strip JSONP wrapper
    if not m:
        return None
    import json as _json
    listing = _json.loads(m.group(1))
    for entry in listing.get('typhoonList', []):
        # entry is a list; find the storm id by matching the English name anywhere in it
        if not any(isinstance(v, str) and v.upper() == storm_name.upper() for v in entry):
            continue
        tid = entry[0]
        vr = requests.get(f'http://typhoon.nmc.cn/weatherservice/typhon/jsons/view_{tid}',
                          timeout=10, headers=HDRS)
        vr.raise_for_status()
        vm = _re.search(r'\((\{.*\})\)', vr.text, _re.S)
        if not vm:
            return None
        view = _json.loads(vm.group(1))
        track = view.get('typhoon', [])
        track = track[8] if len(track) > 8 and isinstance(track[8], list) else []
        if not track:
            return None
        last = track[-1]
        # last fix's forecast block: list of [agency, [[time, lon, lat, pres, wind, ...], ...]]
        fc_block = next((v for v in last if isinstance(v, list) and v and isinstance(v[0], list)), None)
        if not fc_block:
            return None
        for agency_fc in fc_block:
            if not (isinstance(agency_fc, list) and len(agency_fc) >= 2 and agency_fc[0] == 'BABJ'):
                continue
            pts = []
            for f in agency_fc[1]:
                try:
                    pts.append({'lat': float(f[2]), 'lon': float(f[1]),
                                'hour': int(f[0]), 'wind_kt': float(f[4]) * 1.94384})
                except (TypeError, ValueError, IndexError):
                    continue
            cleaned = _clean_points(pts)
            if cleaned:
                return cleaned
    return None


def _fetch_cwb(storm_name):
    """Taiwan CWA open data W-C0034-005 — needs free API key in CWA_API_KEY env var."""
    key = os.environ.get('CWA_API_KEY')
    if not key:
        return None
    r = requests.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005',
                     params={'Authorization': key, 'format': 'JSON'},
                     timeout=10, headers=HDRS)
    r.raise_for_status()
    data = r.json()
    cyclones = (data.get('records', {}).get('tropicalCyclones', {}).get('tropicalCyclone', []))
    for tc in cyclones:
        name = str(tc.get('typhoonName', tc.get('cwaTyphoonName', ''))).upper()
        if storm_name.upper() not in name:
            continue
        fixes = tc.get('forecastData', {}).get('fix', [])
        pts = []
        for f in fixes:
            try:
                lon_s, lat_s = str(f.get('coordinate', '')).split(',')
                wind = f.get('maxWindSpeed')
                pts.append({'lat': float(lat_s), 'lon': float(lon_s),
                            'hour': int(f.get('tau', 0)),
                            'wind_kt': float(wind) * 1.94384 if wind is not None else None})
            except (TypeError, ValueError):
                continue
        cleaned = _clean_points(pts)
        if cleaned:
            return cleaned
    return None


REAL_FETCHERS = {
    'JMA': _fetch_jma,
    'PAGASA': _fetch_pagasa,
    'JTWC': _fetch_jtwc,
    'HKO': _fetch_hko,
    'CMA': _fetch_cma,
    'CWB': _fetch_cwb,
    # ECMWF / GFS / UKMO: free feeds require BUFR/GRIB pipelines — mock until built.
}


# ── Mock ensemble injector ───────────────────────────────────────────────────
def generate_ensemble_spaghetti(base_track, model_id, storm_name):
    """
    Deterministic per-model perturbation of the base forecast track.

    Seeded by storm+model so tracks are stable across refreshes: each model
    gets a fixed cross-track bias direction plus a smooth sinusoidal wobble,
    both growing with lead time — tracks radiate outward like a real
    multi-model uncertainty spread.
    """
    rnd = random.Random(f'{storm_name.upper()}:{model_id}')
    bias_dir = rnd.uniform(0, 2 * math.pi)
    bias_mag = rnd.uniform(0.5, 2.2)       # degrees of divergence at day 5
    wob_amp = rnd.uniform(0.1, 0.45)
    wob_freq = rnd.uniform(0.6, 1.6)
    wob_phase = rnd.uniform(0, 2 * math.pi)
    wind_fac = rnd.uniform(0.85, 1.12)

    pts = []
    for p in base_track:
        d = p['hour'] / 24.0
        growth = (d / 5.0) ** 1.25 * 5.0 if d > 0 else 0.0
        wobble = wob_amp * math.sin(wob_freq * d + wob_phase) * math.sqrt(max(d, 0.0))
        off_lat = (math.sin(bias_dir) * bias_mag + math.cos(bias_dir) * 0.3 * wobble) * growth / 5.0
        off_lon = (math.cos(bias_dir) * bias_mag - math.sin(bias_dir) * 0.3 * wobble) * growth / 5.0
        pts.append({
            'lat': round(p['lat'] + off_lat, 3),
            'lon': round(p['lon'] + off_lon, 3),
            'hour': p['hour'],
            'wind_kt': round(p['wind_kt'] * wind_fac, 1) if p.get('wind_kt') is not None else None,
        })
    return pts


# ── Base track (our own forecast, also the mock skeleton) ───────────────────
def _base_track(track_history):
    """Run the in-house forecast; dead-reckon from recent motion if it fails."""
    try:
        from ai_models import run_forecast
        result = run_forecast(track_history)
        steps = result.get('forecast_steps', [])
        pts = [{'lat': float(s['lat']), 'lon': float(s['lon']), 'hour': int(s['hour']),
                'wind_kt': float(s.get('wind_speed', 35))}
               for s in steps if int(s.get('hour', -1)) in FORECAST_HOURS]
        if len(pts) >= 2:
            return pts, result.get('method', 'physics')
    except Exception as exc:
        logger.warning('multi-model base forecast failed, dead-reckoning: %s', exc)

    last = track_history[-1]
    if len(track_history) >= 2:
        prev = track_history[-2]
        v_lat = float(last['lat']) - float(prev['lat'])
        v_lon = float(last['lon']) - float(prev['lon'])
    else:
        v_lat, v_lon = 0.15, -0.35   # typical WP west-northwest motion per 6 h
    pts = []
    for h in FORECAST_HOURS:
        t = h / 6.0
        recurve = min(1.0, h / 96.0)   # gradual poleward/eastward recurvature
        pts.append({
            'lat': round(float(last['lat']) + v_lat * t + 0.02 * recurve * t, 3),
            'lon': round(float(last['lon']) + v_lon * t * (1 - 0.6 * recurve), 3),
            'hour': h,
            'wind_kt': float(last.get('wind_speed', 35)),
        })
    return pts, 'dead-reckoning'


# ── Public entry point ───────────────────────────────────────────────────────
def get_multi_model_tracks(storm_name, track_history):
    """
    Aggregate forecast tracks from all 10 models for one storm.
    Returns {storm, generated_at_utc, base_method, models: [normalized track x10]}.
    """
    storm_name = str(storm_name or 'UNNAMED').upper()[:32]
    cache_key = storm_name
    now = time.time()
    with _cache_lock:
        hit = _cache.get(cache_key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]

    base, method = _base_track(track_history)

    real_results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(fn, storm_name): mid for mid, fn in REAL_FETCHERS.items()}
        for fut in as_completed(futures):
            mid = futures[fut]
            try:
                real_results[mid] = fut.result()
            except Exception as exc:
                logger.info('%s track feed unavailable for %s: %s', mid, storm_name, exc)
                real_results[mid] = None

    models = []
    for mid in MODEL_ORDER:
        if mid == 'AI_ENSEMBLE':
            models.append(normalize_model_track(base, mid, 'live'))
        elif real_results.get(mid):
            models.append(normalize_model_track(real_results[mid], mid, 'live'))
        else:
            mock = generate_ensemble_spaghetti(base, mid, storm_name)
            models.append(normalize_model_track(mock, mid, 'mock'))

    result = {
        'storm': storm_name,
        'generated_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'base_method': method,
        'models': models,
    }
    with _cache_lock:
        _cache[cache_key] = (now, result)
    return result
