import { Tabs } from 'expo-router/js-tabs';
import { color } from '@/ui/kit';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: color.primary,
      tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
      tabBarStyle: { height: 64, paddingBottom: 8 },
      tabBarIconStyle: { display: 'none' },
    }}>
      <Tabs.Screen name="index" options={{ title: '내 오더' }} />
      <Tabs.Screen name="new" options={{ title: '오더 접수' }} />
      <Tabs.Screen name="account" options={{ title: '내 정보' }} />
    </Tabs>
  );
}
