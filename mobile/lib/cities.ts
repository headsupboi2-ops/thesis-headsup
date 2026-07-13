// ── Philippine cities for the personal Impact Forecast ──────────────
export interface City { name: string; province: string; lat: number; lon: number }

// Naga, Camarines Sur first (the default location).
export const PH_CITIES: City[] = [
  { name: 'Naga',            province: 'Camarines Sur',  lat: 13.62, lon: 123.18 },
  { name: 'Legazpi',         province: 'Albay',          lat: 13.14, lon: 123.74 },
  { name: 'Virac',           province: 'Catanduanes',    lat: 13.58, lon: 124.23 },
  { name: 'Sorsogon City',   province: 'Sorsogon',       lat: 12.97, lon: 124.00 },
  { name: 'Daet',            province: 'Camarines Norte',lat: 14.11, lon: 122.96 },
  { name: 'Manila',          province: 'Metro Manila',   lat: 14.60, lon: 120.98 },
  { name: 'Quezon City',     province: 'Metro Manila',   lat: 14.68, lon: 121.04 },
  { name: 'Baguio',          province: 'Benguet',        lat: 16.41, lon: 120.60 },
  { name: 'Laoag',           province: 'Ilocos Norte',   lat: 18.20, lon: 120.59 },
  { name: 'Tuguegarao',      province: 'Cagayan',        lat: 17.61, lon: 121.73 },
  { name: 'Batangas City',   province: 'Batangas',       lat: 13.76, lon: 121.06 },
  { name: 'Puerto Princesa', province: 'Palawan',        lat: 9.74,  lon: 118.74 },
  { name: 'Roxas City',      province: 'Capiz',          lat: 11.59, lon: 122.75 },
  { name: 'Iloilo City',     province: 'Iloilo',         lat: 10.72, lon: 122.56 },
  { name: 'Bacolod',         province: 'Negros Occ.',    lat: 10.67, lon: 122.95 },
  { name: 'Cebu City',       province: 'Cebu',           lat: 10.32, lon: 123.90 },
  { name: 'Tacloban',        province: 'Leyte',          lat: 11.24, lon: 125.00 },
  { name: 'Cagayan de Oro',  province: 'Misamis Or.',    lat: 8.48,  lon: 124.65 },
  { name: 'Zamboanga City',  province: 'Zamboanga',      lat: 6.91,  lon: 122.08 },
  { name: 'Davao City',      province: 'Davao del Sur',  lat: 7.07,  lon: 125.61 },
  { name: 'General Santos',  province: 'South Cotabato', lat: 6.11,  lon: 125.17 },
]

export const DEFAULT_CITY = PH_CITIES[0]
