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
      <Tabs.Screen name="index" options={{ title: '주문 목록' }} />
      <Tabs.Screen name="current" options={{ title: '진행 중' }} />
      <Tabs.Screen name="history" options={{ title: '운행 내역' }} />
      <Tabs.Screen name="wallet" options={{ title: '충전금' }} />
    </Tabs>
  );
}
