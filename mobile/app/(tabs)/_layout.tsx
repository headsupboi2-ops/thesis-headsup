import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Platform } from 'react-native'
import { colors } from '../../lib/theme'
import { StormDataProvider } from '../../hooks/useStormData'

export default function TabsLayout() {
  return (
    <StormDataProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 86 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Storms',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Accuracy',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
        }}
      />
    </Tabs>
    </StormDataProvider>
  )
}
