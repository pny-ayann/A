import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions } from 'react-native';
import { color } from '@/ui/kit';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: color.primary,
      tabBarInactiveTintColor: color.sub,
      tabBarActiveBackgroundColor: color.primarySoft, // 색만이 아니라 바탕으로도 지금 탭을 알린다
      // 탭이 여럿이라 아주 좁은 휴대폰(360 미만)에서는 글자를 조금 줄여 안 잘리게
      tabBarLabelStyle: { fontSize: width < 360 ? 13 : 15, fontWeight: '700', letterSpacing: width < 360 ? -1 : -0.5 },
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
