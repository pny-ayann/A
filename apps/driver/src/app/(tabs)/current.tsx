import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text } from 'react-native';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useLocationStatus } from '@/lib/location/LocationReporter';
import { myActiveOrders, type ActiveRow } from '@/lib/orders/useOrder';
import { useFocusedInterval } from '@/lib/useInterval';
import { kstShort, won } from '@/lib/time';
import { BigButton, Body, Card, color, Notice, Screen, Title } from '@/ui/kit';

const STATUS: Record<string, string> = { assigned: '배차됨', arrived_pickup: '출발지 도착', driving: '운행 중' };

export default function Current() {
  const { profile } = useAuth();
  const loc = useLocationStatus();
  const [rows, setRows] = useState<ActiveRow[]>([]);
  const load = useCallback(() => { if (profile) void myActiveOrders(profile.id).then(setRows); }, [profile]);
  useFocusEffect(load);
  useFocusedInterval(load, 15_000);

  return (
    <Screen>
      <Title>진행 중</Title>
      {rows.length > 0 && loc.background !== 'granted' && (
        <Card>
          <Notice>배차 중에는 화면이 꺼져도 관제가 위치를 볼 수 있게 위치 권한을 '항상 허용'으로 골라 주세요. (안 해도 운행은 할 수 있어요)</Notice>
          {loc.canAskBackground
            ? <BigButton label="위치 '항상 허용' 하기" onPress={() => void loc.requestBackground()} />
            : <BigButton label="설정 열기" tone="plain" onPress={() => void Linking.openSettings()} />}
        </Card>
      )}
      {rows.length === 0 && <Body sub>진행 중인 오더가 없어요.</Body>}
      {rows.map(r => (
        <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(`/order/${r.id}` as Href)}>
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '800', color: color.primary }}>
              {STATUS[r.status]}{r.reserved_at ? `  [예약] ${kstShort(r.reserved_at)}` : ''}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: color.text }}>{r.pickup_area || '출발지'} → {r.dropoff_area || '도착지'}</Text>
            <Body>{won(r.fare)} · {r.payment_method === 'cash' ? '현금' : '후불'}</Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
