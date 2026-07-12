# HeadsUp Mobile

A React Native (Expo) mobile app for the HeadsUp typhoon forecasting system.
It reuses the existing Flask backend and presents four tabs:

- **Storms** — live active-storm cards with a PAR threat hero and pull-to-refresh
- **Map** — a dark Leaflet map (PAR boundary, storm positions, forecast tracks, and the 10-model ensemble spaghetti)
- **Alerts** — PAR geo-fence warnings (entered / approaching / watch) with opt-in local push notifications
- **Accuracy** — the plain-language "How we predict typhoons" report with native SVG charts

Built with Expo SDK 57, `expo-router`, `react-native-svg` (charts), `react-native-webview` (map), and `expo-notifications` (local alerts). No native build or API keys required — it runs in **Expo Go**.

## Prerequisites

- Node 18+ and npm
- The **Expo Go** app on your iOS/Android phone (from the App Store / Play Store)
- The HeadsUp Flask backend running (see `../backend`)

## 1. Point the app at your backend

A phone can't reach your computer's `localhost`, so the app needs your PC's **LAN IP**.

1. Find your machine's LAN IP:
   - Windows: `ipconfig` → look for "IPv4 Address" (e.g. `192.168.1.42`)
   - macOS/Linux: `ipconfig getifaddr en0` or `hostname -I`
2. Set it either way:
   - **Easiest:** edit `app.json` → `expo.extra.apiBaseUrl` to `http://<your-ip>:5000`
   - **Or** create `.env` with `EXPO_PUBLIC_API_URL=http://<your-ip>:5000` (takes priority)

Your phone and computer must be on the **same Wi-Fi network**.

## 2. Start the backend

```bash
cd ../backend
# activate your venv, then:
python app.py          # serves on 0.0.0.0:5000
```

Make sure your firewall allows inbound connections to port 5000 on your Wi-Fi network.

## 3. Run the app

```bash
cd mobile
npm install            # first time only (use --legacy-peer-deps if npm complains)
npm start              # or: npx expo start
```

Scan the QR code with **Expo Go** (Android) or the **Camera** app (iOS). The app loads on your phone.

## Notes

- **Notifications** are *local* (fired on-device when a storm threatens the PAR). Remote/background push needs a custom dev build — out of scope for Expo Go.
- **The map** uses Leaflet inside a WebView so it works in Expo Go with no Google Maps key. It does **not** render on the web target (`npm run web`) — that's expected; use a phone. A future native-maps upgrade would need an EAS dev build.
- **Data source** is the shared Flask backend; the mobile app adds no new endpoints. Every metric and track is fetched live.

## Project structure

```
app/
  _layout.tsx           # root: safe-area, status bar, notification handler
  (tabs)/
    _layout.tsx         # bottom tab bar + StormDataProvider
    index.tsx           # Storms
    map.tsx             # Map (Leaflet WebView)
    alerts.tsx          # Alerts + notification opt-in
    analytics.tsx       # Accuracy report
lib/                    # config, theme, types, api, par (geofence), alerts
components/             # ScreenHeader, StormCard, LeafletMap, ui, charts/
hooks/useStormData.tsx  # shared live-storm provider + local notifications
```
