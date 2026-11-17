import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useAuth } from '@/lib/auth/AuthProvider';
import { myActiveOrders, type ActiveRow } from '@/lib/orders/useOrder';
import { useFocusedInterval } from '@/lib/useInterval';
import { kstShort, won } from '@/lib/time';
import { Body, Card, color, Screen, Title } from '@/ui/kit';

const STATUS: Record<string, string> = { assigned: '배차됨', arrived_pickup: '출발지 도착', driving: '운행 중' };

export default function Current() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ActiveRow[]>([]);
  const load = useCallback(() => { if (profile) void myActiveOrders(profile.id).then(setRows); }, [profile]);
  useFocusEffect(load);
  useFocusedInterval(load, 15_000);

  return (
    <Screen>
      <Title>진행 중</Title>
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
