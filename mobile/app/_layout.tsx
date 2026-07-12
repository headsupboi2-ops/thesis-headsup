import { useEffect } from 'react'
import { LogBox } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from '../lib/theme'

// Expo Go (SDK 53+) removed REMOTE push notifications, so importing
// expo-notifications logs a scary warning about it. This app only uses LOCAL
// notifications — which DO work in Expo Go — so that warning is about a feature
// we never touch. Suppress it here. This runs before any screen imports
// expo-notifications (the root layout module evaluates first), so the module's
// push side-effect is silenced. On a real dev/production build there's no such
// warning, and local notifications behave identically.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'remote notifications) functionality provided by expo-notifications was removed',
  'We recommend you instead use a development build',
])

export default function RootLayout() {
  useEffect(() => {
    // Lazy-load expo-notifications so its side-effect fires only after the
    // LogBox filter above is registered (a static top-level import would run
    // first and slip past the filter).
    let cancelled = false
    ;(async () => {
      try {
        const Notifications = await import('expo-notifications')
        if (cancelled) return
        // Present PAR alerts as banners while the app is foregrounded.
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        })
        // Android needs an explicit channel for headline alerts.
        await Notifications.setNotificationChannelAsync?.('par-alerts', {
          name: 'PAR Typhoon Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: colors.primary,
        })
      } catch {
        /* notifications unavailable (e.g. web) — ignore */
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
