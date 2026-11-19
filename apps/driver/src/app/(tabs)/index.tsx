import { errorMessage } from '@takson/shared';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { currentPosition, type LatLng } from '@/lib/location/current';
import { PUSH_RECEIVED } from '@/lib/push/PushSetup';
import { sortOpenOrders, type OpenOrder } from '@/lib/orders/list';
import { supabase } from '@/lib/supabase';
import { useFocusedInterval } from '@/lib/useInterval';
import { Body, color, Notice, Title } from '@/ui/kit';

export default function OpenOrders() {
  const [rows, setRows] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const [negative, setNegative] = useState(false);
  const pos = useRef<LatLng | null>(null);

  const load = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    pos.current = (await currentPosition()) ?? pos.current;
    setNoLocation(!pos.current);
    const [{ data, error }, w] = await Promise.all([
      supabase.rpc('list_open_orders', { p_lat: pos.current?.lat ?? null, p_lng: pos.current?.lng ?? null }),
      supabase.rpc('wallet_summary'),
    ]);
    if (error) setMessage(errorMessage(error.message));
    else setRows(sortOpenOrders((data ?? []) as OpenOrder[]));
    if (!w.error) setNegative((((w.data ?? []) as { balance: number }[])[0]?.balance ?? 0) < 0);
    if (withSpinner) setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(true); }, [load]));
  useFocusedInterval(() => void load(), 15_000);
  // 새 오더 알림이 오면 바로 다시 읽는다
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PUSH_RECEIVED, () => void load());
    return () => sub.remove();
  }, [load]);

  async function grab(id: string) {
    setMessage(null);
    setGrabbing(id);
    const { error } = await supabase.rpc('claim_order', { p_order_id: id, p_lat: pos.current?.lat ?? null, p_lng: pos.current?.lng ?? null });
    setGrabbing(null);
    if (error) {
      setMessage(errorMessage(error.message));
      await load();
      return;
    }
    router.push(`/order/${id}` as Href);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'left', 'right']}>
      <FlatList
        data={rows}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(true)} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Title>주문 목록</Title>
            {negative && <Notice tone="danger">충전금이 마이너스라 오더를 잡을 수 없어요. 충전금 탭을 확인해 주세요.</Notice>}
            {noLocation && <Notice>위치를 켜면 내 위치에서 가까운 순으로 보여요.</Notice>}
            {message && <Notice tone="danger">{message}</Notice>}
          </View>
        }
        ListEmptyComponent={loading ? undefined : <Body sub>지금 잡을 수 있는 오더가 없어요. 화면을 아래로 당기면 새로 고쳐요.</Body>}
        renderItem={({ item }) => <OrderCard order={item} busy={grabbing === item.id} onGrab={() => void grab(item.id)} />}
      />
    </SafeAreaView>
  );
}
