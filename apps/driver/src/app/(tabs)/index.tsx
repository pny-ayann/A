import { errorMessage } from '@takson/shared';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { currentPosition, type LatLng } from '@/lib/location/current';
import { PUSH_RECEIVED } from '@/lib/push/PushSetup';
import { searchOrders, sortByFare, sortOpenOrders, type OpenOrder } from '@/lib/orders/list';
import { supabase } from '@/lib/supabase';
import { useFocusedInterval } from '@/lib/useInterval';
import { BigButton, Body, color, Notice, Title } from '@/ui/kit';

export default function OpenOrders() {
  const [rows, setRows] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const [negative, setNegative] = useState(false);
  const pos = useRef<LatLng | null>(null);
  const [sort, setSort] = useState<'dist' | 'fare'>('dist');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const found = searchOrders(rows, from, to);
  const shown = sort === 'fare' ? sortByFare(found) : found; // rows는 이미 거리순

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
      // 목록 위 안내는 스크롤하면 안 보이니 휴대폰에선 팝업으로도 알린다 (웹은 Alert가 안 떠서 위 안내만)
      if (Platform.OS !== 'web') Alert.alert('수락할 수 없어요', errorMessage(error.message), [{ text: '확인' }]);
      await load();
      return;
    }
    router.push(`/order/${id}` as Href);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['top', 'left', 'right']}>
      <View style={s.top}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Title>주문 목록</Title>
          <Text style={{ marginLeft: 'auto', fontSize: 14, color: color.sub }}>{shown.length}개</Text>
          {(['dist', 'fare'] as const).map(k => (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: sort === k }} onPress={() => setSort(k)}
              style={[s.chip, sort === k && { backgroundColor: color.primary, borderColor: color.primary }]}>
              <Text style={[s.chipText, sort === k && { color: '#fff' }]}>{k === 'dist' ? '거리순' : '금액순'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TextInput value={from} onChangeText={setFrom} placeholder="출발지 검색" accessibilityLabel="출발지 검색" style={s.input} placeholderTextColor={color.sub} />
          <TextInput value={to} onChangeText={setTo} placeholder="도착지 검색" accessibilityLabel="도착지 검색" style={s.input} placeholderTextColor={color.sub} />
        </View>
      </View>
      <FlatList
        data={shown}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 12, paddingTop: 8, gap: 6 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(true)} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            {negative && <Notice tone="danger">충전금이 마이너스라 오더를 잡을 수 없어요. 충전금 탭을 확인해 주세요.</Notice>}
            {noLocation && <Notice>위치를 켜면 내 위치에서 가까운 순으로 보여요.</Notice>}
            {message && <Notice tone="danger">{message}</Notice>}
          </View>
        }
        ListEmptyComponent={loading ? undefined : rows.length > 0 ? (
          <Body sub>검색에 맞는 오더가 없어요. 검색 글자를 지워 보세요.</Body>
        ) : (
          <View style={{ gap: 12 }}>
            <Body sub>지금 잡을 수 있는 오더가 없어요. 새 오더가 들어오면 알림이 와요.</Body>
            <BigButton label="새로 고침" tone="plain" onPress={() => void load(true)} />
          </View>
        )}
        renderItem={({ item }) => <OrderCard order={item} busy={grabbing === item.id} onGrab={() => void grab(item.id)} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, backgroundColor: color.bg, borderBottomWidth: 1, borderColor: color.line },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: color.line, backgroundColor: '#fff', justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '700', color: color.text },
  input: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderColor: color.line, borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, fontSize: 16, color: color.text },
});
