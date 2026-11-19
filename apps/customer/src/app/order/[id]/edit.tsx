import { errorMessage } from '@takson/shared';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { kstInputToIso } from '@/lib/newOrder/reserve';
import { useOrder } from '@/lib/orders/useOrder';
import { supabase } from '@/lib/supabase';
import { kstParts } from '@/lib/time';
import { BigButton, Card, color, Field, Notice, Screen } from '@/ui/kit';

const pad = (n: number) => String(n).padStart(2, '0');

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flex: 1, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: on ? color.primary : color.line, backgroundColor: on ? color.primary : '#fff' }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: on ? '#fff' : color.text }}>{label}</Text>
    </Pressable>
  );
}

/**
 * 배차 전 수정 (설계 7.2: 배차 전에는 자유롭게). 주소 자체를 바꾸려면 취소 후 다시 접수한다.
 * 서버는 접수 대기 상태에서만 고객의 수정을 받는다.
 */
export default function EditOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { order } = useOrder(id);
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [pay, setPay] = useState<'cash' | 'postpaid'>('postpaid');
  const [trans, setTrans] = useState<'' | 'auto' | 'manual'>('');
  const [reserveOn, setReserveOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order || v) return;
    const r = order.reserved_at ? kstParts(order.reserved_at) : null;
    setV({
      vehicleNumber: order.vehicle_number ?? '', vehicleModel: order.vehicle_model ?? '', vehicleColor: order.vehicle_color ?? '',
      memo: order.driver_memo ?? '', fare: String(order.fare),
      pickupDetail: order.pickup.detail ?? '', pickupName: order.pickup.contact_name ?? '', pickupPhone: order.pickup.contact_phone ?? '',
      dropoffDetail: order.dropoff.detail ?? '', dropoffName: order.dropoff.contact_name ?? '', dropoffPhone: order.dropoff.contact_phone ?? '',
      date: r ? `${r.y}-${pad(r.m)}-${pad(r.d)}` : '', time: r ? `${pad(r.hh)}:${pad(r.mm)}` : '',
    });
    setPay(order.payment_method);
    setTrans(order.transmission ?? '');
    setReserveOn(!!order.reserved_at);
  }, [order, v]);

  if (!order || !v) return <Screen><Notice>불러오는 중…</Notice></Screen>;
  if (order.status !== 'open') return <Screen><Notice tone="danger">배차된 오더는 고칠 수 없어요. 오더 화면의 "변경 요청"을 써 주세요.</Notice></Screen>;

  const f = (k: string) => ({ value: v[k], onChangeText: (t: string) => setV(x => ({ ...x!, [k]: t })) });
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

  async function save() {
    setError(null);
    if (!v!.vehicleNumber.trim()) { setError('차량번호를 입력해 주세요.'); return; }
    const fare = Number(v!.fare.replace(/[^0-9]/g, ''));
    if (v!.fare.trim() === '' || !Number.isInteger(fare) || fare < 0) { setError('요금은 0원 이상 정수로 넣어 주세요.'); return; }
    let reservedAt: string | null = null;
    if (reserveOn) {
      reservedAt = kstInputToIso(v!.date, v!.time);
      if (!reservedAt) { setError('예약 날짜는 2026-11-20, 시간은 14:00 처럼 넣어 주세요.'); return; }
      if (new Date(reservedAt).getTime() <= Date.now()) { setError('예약 시간이 지났어요.'); return; }
    }
    setBusy(true);
    const { data: changed, error: e } = await supabase.from('orders').update({
      vehicle_number: v!.vehicleNumber.trim(), vehicle_model: orNull(v!.vehicleModel), vehicle_color: orNull(v!.vehicleColor),
      transmission: trans || null, driver_memo: orNull(v!.memo), fare, payment_method: pay, reserved_at: reservedAt,
      pickup_detail: orNull(v!.pickupDetail), pickup_contact_name: orNull(v!.pickupName), pickup_contact_phone: orNull(v!.pickupPhone),
      dropoff_detail: orNull(v!.dropoffDetail), dropoff_contact_name: orNull(v!.dropoffName), dropoff_contact_phone: orNull(v!.dropoffPhone),
    }).eq('id', id).eq('status', 'open').select('id');
    setBusy(false);
    // 그 사이 배차되면 서버가 거절하거나(권한) 바뀐 줄이 0개
    if (e) { setError(errorMessage(e.message)); return; }
    if (!changed?.length) { setError('그 사이 배차돼서 고치지 못했어요. 오더 화면의 "변경 요청"을 써 주세요.'); return; }
    if (router.canGoBack()) router.back(); else router.replace(`/order/${id}` as Href);
  }

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700' }}>출발지 · {order.pickup.address}</Text>
        <Field label="상세주소" {...f('pickupDetail')} />
        <Field label="담당자" {...f('pickupName')} />
        <Field label="연락처" keyboardType="phone-pad" {...f('pickupPhone')} />
      </Card>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700' }}>도착지 · {order.dropoff.address}</Text>
        <Field label="상세주소" {...f('dropoffDetail')} />
        <Field label="담당자" {...f('dropoffName')} />
        <Field label="연락처" keyboardType="phone-pad" {...f('dropoffPhone')} />
      </Card>
      <Notice>주소 자체를 바꾸려면 이 오더를 취소하고 다시 접수해 주세요.</Notice>
      <Card>
        <Field label="차량번호 (필수)" {...f('vehicleNumber')} />
        <Field label="차종" {...f('vehicleModel')} />
        <Field label="색상" {...f('vehicleColor')} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="변속기 모름" on={trans === ''} onPress={() => setTrans('')} />
          <Chip label="오토" on={trans === 'auto'} onPress={() => setTrans('auto')} />
          <Chip label="수동" on={trans === 'manual'} onPress={() => setTrans('manual')} />
        </View>
        <Field label="기사 메모" multiline {...f('memo')} />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="바로" on={!reserveOn} onPress={() => setReserveOn(false)} />
          <Chip label="예약" on={reserveOn} onPress={() => setReserveOn(true)} />
        </View>
        {reserveOn && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 3 }}><Field label="날짜" placeholder="2026-11-20" {...f('date')} /></View>
            <View style={{ flex: 2 }}><Field label="시간" placeholder="14:00" {...f('time')} /></View>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="후불" on={pay === 'postpaid'} onPress={() => setPay('postpaid')} />
          <Chip label="현금" on={pay === 'cash'} onPress={() => setPay('cash')} />
        </View>
        <Field label="요금 (원)" keyboardType="number-pad" {...f('fare')} />
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <BigButton label="저장" onPress={() => void save()} busy={busy} />
    </Screen>
  );
}
