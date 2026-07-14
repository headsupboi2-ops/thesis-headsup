// ── Weather layer catalog ───────────────────────────────────────────
// One entry per selectable overlay. `stops`, `blend`, `radius`, `blur` are
// handed to the map WebView to draw a smooth Windy-style colour field; the
// rest drives the chip bar and legend. Colours match the web app.
import type { Stop } from './weatherColors'

export type WeatherLayerId = 'wind' | 'rain' | 'temp' | 'heat' | 'cloud' | 'wave' | 'thunder' | 'flood'
export type BasemapId = 'dark' | 'satellite'

/** Which grid variable a layer reads. 'wave' comes from the marine grid,
 *  'thunder' is derived from cloud + precip, 'flood' from trailing-24h rainfall
 *  × local susceptibility; the rest are direct weather-grid fields. */
export type LayerSource = 'wind_speed' | 'precip' | 'temp' | 'heat' | 'cloud' | 'wave' | 'thunder' | 'flood'

export interface WeatherLayer {
  id: WeatherLayerId
  label: string
  icon: string          // Ionicons name
  unit: string
  source: LayerSource
  stops: Stop[]
  blend: 'screen' | 'multiply'
  radius: number        // overlay circle radius (px) before blur
  blur: number
  arrows?: boolean      // draw wind-direction arrows (wind only)
}

export const WEATHER_LAYERS: WeatherLayer[] = [
  {
    id: 'wind', label: 'Wind', icon: 'navigate', unit: 'km/h', source: 'wind_speed',
    blend: 'screen', radius: 88, blur: 16, arrows: true,
    stops: [[0, [3, 80, 200]], [8, [0, 200, 255]], [15, [0, 230, 70]], [25, [255, 230, 0]], [35, [255, 120, 0]], [45, [255, 30, 30]]],
  },
  {
    id: 'rain', label: 'Rain', icon: 'rainy', unit: 'mm/h', source: 'precip',
    blend: 'screen', radius: 84, blur: 18,
    stops: [[0, [0, 0, 0]], [0.4, [0, 80, 30]], [1, [0, 190, 60]], [4, [80, 215, 0]], [10, [230, 210, 0]], [25, [255, 110, 0]], [50, [255, 10, 0]], [80, [180, 0, 220]]],
  },
  {
    id: 'temp', label: 'Temp', icon: 'thermometer', unit: '°C', source: 'temp',
    blend: 'screen', radius: 92, blur: 16,
    stops: [[10, [5, 0, 50]], [18, [10, 20, 150]], [24, [0, 100, 220]], [28, [0, 200, 80]], [32, [220, 200, 0]], [36, [255, 80, 0]], [40, [255, 255, 80]]],
  },
  {
    id: 'heat', label: 'Heat', icon: 'flame', unit: '°C', source: 'heat',
    blend: 'screen', radius: 92, blur: 16,
    stops: [[18, [5, 0, 60]], [24, [0, 80, 200]], [29, [0, 185, 70]], [33, [255, 140, 0]], [38, [255, 15, 0]], [42, [200, 0, 200]]],
  },
  {
    id: 'cloud', label: 'Cloud', icon: 'cloud', unit: '%', source: 'cloud',
    blend: 'screen', radius: 90, blur: 20,
    stops: [[0, [0, 0, 0]], [20, [30, 40, 60]], [50, [90, 110, 140]], [80, [170, 190, 215]], [100, [235, 245, 255]]],
  },
  {
    id: 'wave', label: 'Waves', icon: 'water', unit: 'm', source: 'wave',
    blend: 'multiply', radius: 92, blur: 16,
    stops: [[0, [255, 255, 255]], [0.3, [200, 240, 255]], [1, [100, 190, 255]], [2.5, [30, 120, 255]], [4.5, [0, 50, 200]], [7, [60, 0, 160]]],
  },
  {
    id: 'thunder', label: 'Storm', icon: 'thunderstorm', unit: '%', source: 'thunder',
    blend: 'screen', radius: 84, blur: 18,
    stops: [[0, [0, 0, 0]], [18, [30, 25, 0]], [35, [120, 90, 0]], [55, [220, 160, 0]], [72, [255, 70, 0]], [88, [200, 0, 160]], [100, [255, 0, 255]]],
  },
  {
    id: 'flood', label: 'Flood', icon: 'water', unit: '', source: 'flood',
    blend: 'screen', radius: 84, blur: 18,
    // Trailing-24h rainfall × susceptibility, scored 0–100 to match flood levels
    // (12 low · 30 moderate · 50 high · 70 severe).
    stops: [[0, [0, 0, 0]], [6, [0, 70, 35]], [12, [225, 225, 0]], [30, [255, 150, 0]], [50, [255, 40, 30]], [70, [176, 38, 255]], [100, [150, 0, 220]]],
  },
]

export const WEATHER_LAYER_BY_ID: Record<WeatherLayerId, WeatherLayer> =
  Object.fromEntries(WEATHER_LAYERS.map(l => [l.id, l])) as Record<WeatherLayerId, WeatherLayer>
