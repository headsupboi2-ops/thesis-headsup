// ── API base URL resolution ─────────────────────────────────────────
// Priority: EXPO_PUBLIC_API_URL env → auto-derived LAN host → app.json
// extra.apiBaseUrl → localhost.
//
// The dev machine's Wi-Fi IP changes with DHCP, which used to break the
// hardcoded app.json URL. Instead we read the address the phone actually
// loaded Metro from (Expo's host URI) and point the backend at that same
// host on port 5000 — so the API keeps working across IP changes with no
// manual edits. Only applies to LAN IPv4 hosts; a tunnel host (exp.direct)
// isn't a reachable backend, so those fall back to app.json.
import Constants from 'expo-constants'

const fromEnv = process.env.EXPO_PUBLIC_API_URL
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl

function apiFromMetroHost(): string | null {
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string }
    expoGoConfig?: { debuggerHost?: string }
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } }
    manifest?: { debuggerHost?: string; hostUri?: string }
  }
  const uri =
    c.expoConfig?.hostUri ||
    c.expoGoConfig?.debuggerHost ||
    c.manifest2?.extra?.expoGo?.debuggerHost ||
    c.manifest?.debuggerHost ||
    c.manifest?.hostUri
  if (!uri) return null
  const host = uri.split(':')[0].trim()
  // LAN IPv4 only — skip localhost and tunnel domains (they aren't the backend).
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return null
  return `http://${host}:5000`
}

const fromMetro = apiFromMetroHost()

export const API_BASE = (fromEnv || fromMetro || fromExtra || 'http://localhost:5000').replace(/\/+$/, '')

/** True when the base URL is still the placeholder LAN IP from the template. */
export const API_IS_PLACEHOLDER = API_BASE.includes('192.168.1.100')
