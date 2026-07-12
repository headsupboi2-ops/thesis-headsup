// ── API base URL resolution ─────────────────────────────────────────
// Priority: EXPO_PUBLIC_API_URL env → app.json extra.apiBaseUrl → localhost.
// A phone can't reach the dev machine's localhost, so set your LAN IP in
// app.json (extra.apiBaseUrl) or an .env file — see README.
import Constants from 'expo-constants'

const fromEnv = process.env.EXPO_PUBLIC_API_URL
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl

export const API_BASE = (fromEnv || fromExtra || 'http://localhost:5000').replace(/\/+$/, '')

/** True when the base URL is still the placeholder LAN IP from the template. */
export const API_IS_PLACEHOLDER = API_BASE.includes('192.168.1.100')
