import { Tabs } from 'expo-router/js-tabs';
import { color } from '@/ui/kit';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: color.primary,
      tabBarInactiveTintColor: color.sub,
      tabBarActiveBackgroundColor: color.primarySoft, // 색만이 아니라 바탕으로도 지금 탭을 알린다
      tabBarLabelStyle: { fontSize: 15, fontWeight: '700' },
      tabBarStyle: { height: 64, paddingBottom: 8 },
      tabBarIconStyle: { display: 'none' },
    }}>
      <Tabs.Screen name="index" options={{ title: '내 오더' }} />
      <Tabs.Screen name="new" options={{ title: '오더 접수' }} />
      <Tabs.Screen name="account" options={{ title: '내 정보' }} />
    </Tabs>
  );
}
