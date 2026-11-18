import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth/AuthProvider';
import { latestPerOrder, summarize } from '@/lib/history/summary';
import { supabase } from '@/lib/supabase';
import { kstShort, won } from '@/lib/time';
import { BigButton, Body, Card, color } from '@/ui/kit';

type Done = { orderId: string; completedAt: string; fare: number; from: string; to: string; kind: string };
type Row = { order_id: string; created_at: string; orders: { fare: number; kind: string; pickup_address: string; dropoff_address: string } };

/** 운행 내역: 오늘·이번 달(한국 시간) 건수와 요금 합계, 최근 완료 30건 */
export default function History() {
  const { profile, signOut } = useAuth();
  const [rows, setRows] = useState<Done[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    // 이번 달 합계에 필요한 만큼(최대 32일) + 최근 30건
    const since = new Date(Date.now() - 32 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from('order_events')
      .select('order_id, created_at, orders!inner(fare, kind, pickup_address, dropoff_address, driver_id)')
      .eq('type', 'status').eq('to_status', 'completed').eq('orders.driver_id', profile.id)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(500);
    setLoading(false);
    if (!data) return;
    setRows(latestPerOrder((data as unknown as Row[]).map(r => ({
      orderId: r.order_id, completedAt: r.created_at, fare: r.orders.fare, kind: r.orders.kind,
      from: r.orders.pickup_address, to: r.orders.dropoff_address,
    }))));
  }, [profile]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sum = summarize(rows, new Date());
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['left', 'right']}>
      <FlatList data={rows.slice(0, 30)} keyExtractor={r => r.orderId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Total title="오늘" count={sum.today.count} amount={sum.today.sum} />
              <Total title="이번 달" count={sum.month.count} amount={sum.month.sum} />
            </View>
            <Body sub>요금 합계예요. 수수료를 뺀 금액은 정산 기능(2단계)에서 보여요.</Body>
            <Body style={{ fontWeight: '700' }}>최근 완료</Body>
          </View>
        }
        ListEmptyComponent={<Body sub>최근 한 달 동안 마친 운행이 없어요.</Body>}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, color: color.sub }}>{kstShort(item.completedAt)} · {item.kind === 'daeri' ? '대리' : '탁송'}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: color.text }}>{won(item.fare)}</Text>
            </View>
            <Body>{item.from} → {item.to}</Body>
          </Card>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 16, gap: 8 }}>
            <Body sub>{profile?.name} 기사님</Body>
            <BigButton label="로그아웃" tone="plain" onPress={signOut} />
          </View>
        } />
    </SafeAreaView>
  );
}

function Total({ title, count, amount }: { title: string; count: number; amount: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: color.line, padding: 14, gap: 4 }}>
      <Text style={{ fontSize: 16, color: color.sub }}>{title}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: color.text }}>{count}건</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: color.primary }}>{won(amount)}</Text>
    </View>
  );
}
