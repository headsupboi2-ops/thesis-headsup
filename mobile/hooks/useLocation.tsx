// ── Selected-city context ───────────────────────────────────────────
// Holds the user's chosen PH city for the Impact Forecast. Defaults to Naga.
// (In-session only; AsyncStorage persistence is an easy later addition.)
import { createContext, useContext, useState, ReactNode } from 'react'
import { DEFAULT_CITY, type City } from '../lib/cities'

interface LocationCtx { city: City; setCity: (c: City) => void }
const Ctx = createContext<LocationCtx | null>(null)

export function LocationProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<City>(DEFAULT_CITY)
  return <Ctx.Provider value={{ city, setCity }}>{children}</Ctx.Provider>
}

export function useLocation(): LocationCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLocation must be used within LocationProvider')
  return v
}
