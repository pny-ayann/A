import { calcFare, emptyPlace, errorMessage, type AmendReason, type FareBand, type Place } from '@takson/shared';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text } from 'react-native';
import { PlaceInput } from '@/components/PlaceInput';
import { routeKm } from '@/lib/kakao';
import { amendDefaultFare, fareState } from '@/lib/newOrder/fare';
import { amendPayload } from '@/lib/orders/actions';
import { useOrder, type Stop } from '@/lib/orders/useOrder';
import { supabase } from '@/lib/supabase';
import { won } from '@/lib/time';
import { BigButton, Body, Card, color, Field, Notice, Screen } from '@/ui/kit';

type Mission = { id: string; name: string; extra_fare: number };

const REASONS: { key: AmendReason; label: string }[] = [
  { key: 'dropoff_change', label: '도착지 변경' },
  { key: 'waypoint_added', label: '경유지 추가' },
  { key: 'mission_added', label: '미션 추가' },
];

const toPlace = (s: Stop): Place => ({
  address: s.address, detail: s.detail ?? '', area: s.area, lat: s.lat, lng: s.lng,
  contactName: s.contact_name ?? '', contactPhone: s.contact_phone ?? '',
});

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
        borderWidth: 1, borderColor: on ? color.primary : color.line, backgroundColor: on ? color.primary : '#fff' }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: on ? '#fff' : color.text }}>{label}</Text>
    </Pressable>
  );
}

/**
 * 배차 후 변경 (설계 7.2): 도착지 변경·경유지 추가·미션 추가일 때만 요금을 함께 바꿀 수 있다.
 * 사유가 기록되고 기사·관제에 알림이 간다(서버).
 */
export default function Amend() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { order, reload } = useOrder(id);
  const [reason, setReason] = useState<AmendReason | null>(null);
  const [place, setPlace] = useState<Place>(emptyPlace());
  const [missionId, setMissionId] = useState<string | undefined>();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [bands, setBands] = useState<FareBand[]>([]);
  const [km, setKm] = useState<number | null>(null);
  const [routeFailed, setRouteFailed] = useState(false);
  const [fareText, setFareText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('missions').select('id, name, extra_fare').eq('active', true).order('name').then(({ data }) => setMissions((data ?? []) as Mission[]));
    void supabase.from('fare_bands').select('max_km, fare').then(({ data }) => setBands((data ?? []) as FareBand[]));
  }, []);

  // 바뀐 경로로 거리 다시 계산 (미션 추가는 경로 그대로)
  const stops: Place[] = !order ? [] : reason === 'dropoff_change'
    ? [toPlace(order.pickup), ...order.waypoints.map(toPlace), place]
    : reason === 'waypoint_added'
      ? [toPlace(order.pickup), ...order.waypoints.map(toPlace), place, toPlace(order.dropoff)]
      : [toPlace(order.pickup), ...order.waypoints.map(toPlace), toPlace(order.dropoff)];
  const key = `${reason}|${stops.map(p => `${p.lat},${p.lng}`).join(';')}`;
  useEffect(() => {
    setKm(null); setRouteFailed(false);
    if (!order || !reason || stops.some(p => !p.address)) return;
    if (stops.some(p => p.lat === null || p.lng === null)) { setRouteFailed(true); return; }
    let alive = true;
    void routeKm(stops.map(p => ({ lat: p.lat!, lng: p.lng! }))).then(v => { if (alive) { if (v === null) setRouteFailed(true); else setKm(v); } });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return <Screen><Notice>불러오는 중…</Notice></Screen>;
  if (!['assigned', 'arrived_pickup', 'driving'].includes(order.status)) {
    return <Screen><Notice tone="danger">지금 상태에서는 변경 요청을 할 수 없어요.</Notice></Screen>;
  }

  const have = new Set(order.missions.map(m => m.id));
  const extras = [...order.missions.map(m => m.extra_fare), ...(reason === 'mission_added' && missionId ? [missions.find(m => m.id === missionId)?.extra_fare ?? 0] : [])];
  const edited = fareText === '' ? null : Number(fareText);
  const fs = fareState({ km, routeFailed, bands, missionExtras: extras, edited: null });
  const oldAuto = order.distance_km !== null && bands.length
    ? calcFare(order.distance_km, bands, order.missions.map(m => m.extra_fare)) : null;
  const suggested = reason ? amendDefaultFare({
    current: order.fare, reason,
    missionExtra: missionId ? missions.find(m => m.id === missionId)?.extra_fare ?? 0 : null,
    oldAuto, newAuto: fs.auto,
  }) : null;
  const fare = edited ?? suggested;

  async function send() {
    setError(null);
    const p = amendPayload({ reason, fare, place, missionId });
    if (typeof p === 'string') { setError(p); return; }
    if (p.p_fare < order!.fare) {
      const msg = `요금이 ${won(order!.fare)}에서 ${won(p.p_fare)}으로 내려가요. 이대로 보낼까요?`;
      const ok = Platform.OS === 'web'
        ? window.confirm(msg)
        : await new Promise<boolean>(res => Alert.alert('요금 확인', msg, [
            { text: '다시 볼게요', style: 'cancel', onPress: () => res(false) },
            { text: '보낼게요', onPress: () => res(true) },
          ], { cancelable: true, onDismiss: () => res(false) }));
      if (!ok) return;
    }
    setBusy(true);
    const { error: e } = await supabase.rpc('customer_amend_order', { p_order_id: id, ...p });
    setBusy(false);
    if (e) { setError(errorMessage(e.message)); void reload(); return; }
    if (router.canGoBack()) router.back(); else router.replace(`/order/${id}` as Href);
  }

  return (
    <Screen>
      <Body sub>지금 요금: {won(order.fare)}</Body>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700' }}>무엇을 바꾸나요?</Text>
        {REASONS.map(r => <Chip key={r.key} label={r.label} on={reason === r.key} onPress={() => { setReason(r.key); setPlace(emptyPlace()); setMissionId(undefined); setFareText(''); }} />)}
      </Card>

      {reason === 'dropoff_change' && <PlaceInput title="새 도착지" value={place} onChange={setPlace} top={[]} />}
      {reason === 'waypoint_added' && <PlaceInput title="추가할 경유지 (도착지 바로 전)" value={place} onChange={setPlace} top={[]} />}
      {reason === 'mission_added' && (
        <Card>
          {missions.filter(m => !have.has(m.id)).map(m => (
            <Chip key={m.id} label={`${m.name}${m.extra_fare ? ` +${won(m.extra_fare)}` : ''}`} on={missionId === m.id} onPress={() => setMissionId(m.id)} />
          ))}
          {missions.every(m => have.has(m.id)) && <Body sub>더 추가할 미션이 없어요.</Body>}
        </Card>
      )}

      {reason && (
        <Card>
          {fs.auto !== null && <Body sub>새 자동 요금 {won(fs.auto)}{km !== null ? ` (${km}km)` : ''}</Body>}
          {!!fs.note && <Notice>{fs.note}</Notice>}
          {fare !== null && <Body>{won(order.fare)} → {won(fare)}</Body>}
          <Field label="새 요금 (원)" keyboardType="number-pad" value={fareText !== '' ? fareText : suggested !== null ? String(suggested) : ''}
            onChangeText={t => setFareText(t.replace(/[^0-9]/g, ''))} />
          <Body sub>바꾸면 기사님과 관제에 바로 알림이 가요.</Body>
        </Card>
      )}
      {!!error && <Notice tone="danger">{error}</Notice>}
      <BigButton label="변경 요청 보내기" onPress={() => void send()} busy={busy} disabled={!reason} />
    </Screen>
  );
}
