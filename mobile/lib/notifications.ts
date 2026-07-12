// ── Expo Go-safe local notifications wrapper ────────────────────────
// Remote push was removed from Expo Go in SDK 53+; this app only uses LOCAL
// notifications (which work in Expo Go). Importing THIS module does not import
// expo-notifications — that happens lazily on first use, by which point the
// LogBox push-warning filter in app/_layout.tsx is already registered.

export interface NotifPermission { granted: boolean; canAskAgain: boolean }

const loadModule = () => import('expo-notifications')

export async function getNotificationPermission(): Promise<NotifPermission> {
  try {
    const N = await loadModule()
    const p = await N.getPermissionsAsync()
    return { granted: p.granted, canAskAgain: p.canAskAgain }
  } catch {
    return { granted: false, canAskAgain: false }
  }
}

export async function requestNotificationPermission(): Promise<NotifPermission> {
  try {
    const N = await loadModule()
    const p = await N.requestPermissionsAsync()
    return { granted: p.granted, canAskAgain: p.canAskAgain }
  } catch {
    return { granted: false, canAskAgain: false }
  }
}

/** Present a local notification immediately (trigger: null). No-op on failure. */
export async function scheduleLocalNotification(title: string, body: string): Promise<void> {
  try {
    const N = await loadModule()
    await N.scheduleNotificationAsync({ content: { title, body }, trigger: null })
  } catch {
    /* notifications unavailable — ignore */
  }
}
