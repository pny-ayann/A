import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { ago, statusLabel } from '@/lib/orders/labels';
import { useOrder, type Stop } from '@/lib/orders/useOrder';
import { supabase } from '@/lib/supabase';
import { kstShort, won } from '@/lib/time';
import { useFocusedInterval } from '@/lib/useInterval';
import { BigButton, Body, Card, color, Notice, Screen, Title } from '@/ui/kit';

const STEPS = ['open', 'assigned', 'arrived_pickup', 'driving', 'completed'] as const;
const RUNNING = ['assigned', 'arrived_pickup', 'driving'];

function StopBlock({ title, stop }: { title: string; stop: Stop }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 14, color: color.sub, fontWeight: '700' }}>{title}</Text>
      <Body>{stop.address}{stop.detail ? ` ${stop.detail}` : ''}</Body>
      {(stop.contact_name || stop.contact_phone) && (
        <Body sub>{[stop.contact_name, stop.contact_phone].filter(Boolean).join(' · ')}</Body>
      )}
    </View>
  );
}

/** 오더 상세: 상태, 경로, 차량, 요금, 기사(전화·위치), 기록 */
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { order, events, driver, missing } = useOrder(id);
  const [loc, setLoc] = useState<{ lat: number; lng: number; updated_at: string } | null>(null);
  const [now, setNow] = useState(new Date());

  const running = !!order && RUNNING.includes(order.status);
  const readLocation = useCallback(async () => {
    setNow(new Date());
    if (!order?.driver_id || !RUNNING.includes(order.status)) { setLoc(null); return; }
    const { data } = await supabase.from('driver_locations').select('lat, lng, updated_at').eq('driver_id', order.driver_id).maybeSingle();
    setLoc((data as typeof loc) ?? null);
  }, [order?.driver_id, order?.status]);
  useFocusedInterval(() => void readLocation(), 30_000);
  // 기사·상태가 바뀌면 바로 한 번
  useEffect(() => { void readLocation(); }, [readLocation]);

  if (missing) return <Screen><Notice tone="danger">오더를 찾을 수 없어요.</Notice></Screen>;
  if (!order) return <Screen><Body sub>불러오는 중…</Body></Screen>;

  const stepIdx = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const statusEvents = events.filter(e => e.type === 'status' && e.to_status);

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Title>{statusLabel(order.status)}</Title>
        {order.reserved_at && <Body style={{ color: color.warn, fontWeight: '700' }}>[예약] {kstShort(order.reserved_at)}</Body>}
      </View>

      {order.status !== 'cancelled' && (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i <= stepIdx ? color.primary : color.line }} />
          ))}
        </View>
      )}

      {order.driver_id && (
        <Card>
          <Text style={{ fontSize: 14, color: color.sub, fontWeight: '700' }}>기사</Text>
          <Body>{driver?.name ?? '기사'}{driver?.phone ? ` · ${driver.phone}` : ''}</Body>
          {driver?.phone && order.status !== 'completed' && (
            <BigButton label="기사에게 전화" tone="plain" onPress={() => void Linking.openURL(`tel:${driver.phone}`)} />
          )}
          {running && (loc
            ? <BigButton label={`카카오맵에서 기사 위치 보기 (${ago(loc.updated_at, now)})`} tone="plain"
                onPress={() => void Linking.openURL(`https://map.kakao.com/link/map/${encodeURIComponent('기사 위치')},${loc.lat},${loc.lng}`)} />
            : <Body sub>기사 위치를 아직 받지 못했어요.</Body>)}
        </Card>
      )}

      <Card>
        <StopBlock title="출발지" stop={order.pickup} />
        {order.waypoints.map((w, i) => <StopBlock key={i} title={`경유지 ${i + 1}`} stop={w} />)}
        <StopBlock title="도착지" stop={order.dropoff} />
      </Card>

      <Card>
        <Body>{order.kind === 'daeri' ? '대리' : '탁송'} · {order.vehicle_number ?? '차량번호 없음'}</Body>
        {(order.vehicle_model || order.vehicle_color || order.transmission) && (
          <Body sub>{[order.vehicle_model, order.vehicle_color, order.transmission === 'auto' ? '오토' : order.transmission === 'manual' ? '수동' : null].filter(Boolean).join(' · ')}</Body>
        )}
        <Body>{won(order.fare)} · {order.payment_method === 'cash' ? '현금' : '후불'}{order.distance_km ? ` · ${order.distance_km}km` : ''}</Body>
        {order.missions.length > 0 && <Body sub>미션: {order.missions.map(m => m.name).join(', ')}</Body>}
        {order.driver_memo && <Body sub>기사 메모: {order.driver_memo}</Body>}
      </Card>

      <Card>
        <Text style={{ fontSize: 14, color: color.sub, fontWeight: '700' }}>기록</Text>
        <Body sub>{kstShort(order.created_at)} 접수</Body>
        {statusEvents.map(e => (
          <Body key={e.id} sub>{kstShort(e.created_at)} {statusLabel(e.to_status as never)}{e.reason ? ` – ${e.reason}` : ''}</Body>
        ))}
      </Card>
    </Screen>
  );
}
