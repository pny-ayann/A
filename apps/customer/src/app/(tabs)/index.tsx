import { subscribeAuthed, uniqueTopic, type OrderStatus } from '@takson/shared';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth/AuthProvider';
import { statusLabel } from '@/lib/orders/labels';
import { splitTabs, type ListOrder } from '@/lib/orders/list';
import { PUSH_RECEIVED } from '@/lib/push/PushSetup';
import { supabase } from '@/lib/supabase';
import { kstShort, won } from '@/lib/time';
import { color } from '@/ui/kit';

type Row = ListOrder & {
  pickup_area: string | null; pickup_address: string; dropoff_area: string | null; dropoff_address: string;
  vehicle_number: string | null; fare: number; order_no: string;
};
const COLS = 'id, order_no, status, created_at, reserved_at, pickup_area, pickup_address, dropoff_area, dropoff_address, vehicle_number, fare';

const tone = (s: OrderStatus) => (s === 'open' ? color.warn : s === 'completed' ? color.ok : s === 'cancelled' ? color.sub : color.primary);

/** 내 업체 오더 (실시간). 진행 중 / 끝난 오더 */
export default function MyOrders() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    // 최근 60일 + 아직 안 끝난 것 전부 (서버 권한이 막아도 앱에서도 내 업체로 한 번 더 거른다)
    const [recent, running, ur] = await Promise.all([
      supabase.from('orders').select(COLS).eq('company_id', companyId).gte('created_at', since)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('orders').select(COLS).eq('company_id', companyId).not('status', 'in', '(completed,cancelled)'),
      supabase.rpc('unread_counts'),
    ]);
    const u: Record<string, number> = {};
    for (const r of (ur.data ?? []) as { order_id: string; thread: string; unread: number }[]) if (r.thread === 'customer') u[r.order_id] = r.unread;
    setUnread(u);
    setLoading(false);
    if (recent.error || running.error) return; // 신호 문제: 하나라도 실패하면 지금 목록 유지 (끝난 오더 탭이 비지 않게)
    const map = new Map<string, Row>();
    for (const r of [...(recent.data ?? []), ...(running.data ?? [])] as Row[]) map.set(r.id, r);
    setRows([...map.values()]);
  }, [companyId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!companyId) return;
    return subscribeAuthed(supabase, () => supabase.channel(uniqueTopic(`c-orders-${companyId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, () => void load())
      .subscribe());
  }, [companyId, load]);

  // 알림이 오면(문의 등 실시간으로 안 오는 것까지) 다시 읽기
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PUSH_RECEIVED, () => void load());
    return () => sub.remove();
  }, [load]);

  const { active, done } = splitTabs(rows);
  const list = tab === 'active' ? active : done;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 }}>
        {(['active', 'done'] as const).map(k => (
          <Pressable key={k} accessibilityRole="button" onPress={() => setTab(k)}
            style={{
              flex: 1, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              backgroundColor: tab === k ? color.primary : '#fff', borderWidth: 1, borderColor: tab === k ? color.primary : color.line,
            }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: tab === k ? '#fff' : color.text }}>
              {k === 'active' ? `진행 중 ${active.length}` : `끝난 오더 ${done.length}`}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList data={list} keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
        ListEmptyComponent={
          <Text style={{ fontSize: 17, color: color.sub, textAlign: 'center', marginTop: 40 }}>
            {tab === 'active' ? '진행 중인 오더가 없어요. 아래 "오더 접수"에서 넣어 주세요.' : '끝난 오더가 없어요.'}
          </Text>
        }
        renderItem={({ item: r }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/order/${r.id}` as Href)}
            style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: color.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: tone(r.status) }}>{statusLabel(r.status)} <Text style={{ color: color.sub, fontWeight: '400' }}>{r.order_no}</Text></Text>
              <Text style={{ fontSize: 15, color: color.sub }}>
                {r.reserved_at ? `[예약] ${kstShort(r.reserved_at)}` : kstShort(r.created_at)}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: color.text }}>
              {r.pickup_area || r.pickup_address} → {r.dropoff_area || r.dropoff_address}
            </Text>
            <Text style={{ fontSize: 15, color: color.sub }}>{r.vehicle_number ?? '차량번호 없음'} · {won(r.fare)}</Text>
            {unread[r.id] ? <Text style={{ fontSize: 15, fontWeight: '700', color: color.danger }}>관제 새 메시지 {unread[r.id]}</Text> : null}
          </Pressable>
        )} />
    </SafeAreaView>
  );
}
