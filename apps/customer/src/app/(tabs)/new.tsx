import {
  emptyPlace, errorMessage, toOrderInsert, toWaypointRows, validateOrderForm,
  type FareBand, type OrderForm, type Place,
} from '@takson/shared';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlaceInput } from '@/components/PlaceInput';
import { useAuth } from '@/lib/auth/AuthProvider';
import { routeKm } from '@/lib/kakao';
import { fareState } from '@/lib/newOrder/fare';
import { kstInputToIso } from '@/lib/newOrder/reserve';
import { supabase } from '@/lib/supabase';
import { kstParts, won } from '@/lib/time';
import { BigButton, Body, Card, color, Field, Notice, Screen, Title } from '@/ui/kit';

type Mission = { id: string; name: string; extra_fare: number };

const pad = (n: number) => String(n).padStart(2, '0');
/** 지금부터 1시간 뒤(한국 시간)를 예약 입력 기본값으로 */
function defaultReserve(): { date: string; time: string } {
  const p = kstParts(new Date(Date.now() + 3600_000));
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:00` };
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flex: 1, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
        borderWidth: 1, borderColor: on ? color.primary : color.line, backgroundColor: on ? color.primary : '#fff' }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: on ? '#fff' : color.text }}>{label}</Text>
    </Pressable>
  );
}

function blankForm(companyId: string, payment: 'cash' | 'postpaid'): OrderForm {
  return {
    companyId, kind: 'takson', pickup: emptyPlace(), dropoff: emptyPlace(), waypoints: [],
    vehicleNumber: '', vehicleModel: '', vehicleColor: '', transmission: '', driverMemo: '',
    missionIds: [], reservedAt: null, paymentMethod: payment, fare: null, distanceKm: null, staffOnly: false,
  };
}

/** 오더 접수 (설계 7.1) */
export default function NewOrder() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? '';
  const [defaultPay, setDefaultPay] = useState<'cash' | 'postpaid'>('postpaid');
  const [form, setForm] = useState<OrderForm>(() => blankForm(companyId, 'postpaid'));
  const [top, setTop] = useState<Place[]>([]);
  const [bands, setBands] = useState<FareBand[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [km, setKm] = useState<number | null>(null);
  const [routeFailed, setRouteFailed] = useState(false);
  const [edited, setEdited] = useState<number | null>(null);
  const [fareText, setFareText] = useState('');
  const [reserve, setReserve] = useState<{ on: boolean; date: string; time: string }>({ on: false, ...defaultReserve() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<OrderForm>) => setForm(f => ({ ...f, ...patch }));

  // 요금표·미션·업체 기본 결제·자주 쓰는 주소
  useFocusEffect(useCallback(() => {
    if (!companyId) return;
    void (async () => {
      const [b, m, c, t] = await Promise.all([
        supabase.from('fare_bands').select('max_km, fare'),
        supabase.from('missions').select('id, name, extra_fare').eq('active', true).order('name'),
        supabase.from('companies').select('default_payment').eq('id', companyId).maybeSingle(),
        supabase.rpc('top_addresses', { p_company_id: companyId }),
      ]);
      setBands((b.data ?? []) as FareBand[]);
      setMissions((m.data ?? []) as Mission[]);
      const pay = (c.data as { default_payment: 'cash' | 'postpaid' } | null)?.default_payment ?? 'postpaid';
      setDefaultPay(pay);
      setForm(f => (f.pickup.address || f.dropoff.address ? f : { ...f, paymentMethod: pay, companyId }));
      setTop(((t.data ?? []) as Record<string, unknown>[]).map(a => ({
        address: String(a.address ?? ''), detail: String(a.detail ?? ''), area: (a.area as string | null) ?? null,
        lat: (a.lat as number | null) ?? null, lng: (a.lng as number | null) ?? null,
        contactName: String(a.contact_name ?? ''), contactPhone: String(a.contact_phone ?? ''),
      })));
    })();
  }, [companyId]));

  // 출발·경유·도착이 다 정해지면 거리 계산
  const stops = [form.pickup, ...form.waypoints, form.dropoff];
  const stopsKey = stops.map(p => `${p.address}|${p.lat}|${p.lng}`).join(';');
  useEffect(() => {
    setKm(null);
    setRouteFailed(false);
    if (stops.some(p => !p.address)) return;
    if (stops.some(p => p.lat === null || p.lng === null)) { setRouteFailed(true); return; }
    let alive = true;
    void routeKm(stops.map(p => ({ lat: p.lat!, lng: p.lng! }))).then(v => {
      if (!alive) return;
      if (v === null) setRouteFailed(true); else setKm(v);
    });
    return () => { alive = false; };
    // stopsKey가 주소·좌표를 모두 담고 있다
  }, [stopsKey]);

  const extras = missions.filter(m => form.missionIds.includes(m.id)).map(m => m.extra_fare);
  const fs = fareState({ km, routeFailed, bands, missionExtras: extras, edited });

  async function submit() {
    setError(null);
    let reservedAt: string | null = null;
    if (reserve.on) {
      reservedAt = kstInputToIso(reserve.date, reserve.time);
      if (!reservedAt) { setError('예약 날짜는 2026-11-20, 시간은 14:00 처럼 넣어 주세요.'); return; }
    }
    const f: OrderForm = { ...form, companyId, staffOnly: false, reservedAt, fare: fs.fare, distanceKm: km };
    const problem = validateOrderForm(f, new Date());
    if (problem) { setError(problem); return; }
    setBusy(true);
    // 미션 추가요금은 화면 값이 아니라 서버에 있는 값으로 기록 (관제 웹과 같음)
    let ms: Mission[] = [];
    if (f.missionIds.length) {
      const m = await supabase.from('missions').select('id, name, extra_fare').in('id', f.missionIds).eq('active', true);
      if (m.error || m.data.length !== new Set(f.missionIds).size) { setBusy(false); setError('꺼진 미션이 있어요. 다시 골라 주세요.'); return; }
      ms = m.data as Mission[];
    }
    const ins = await supabase.from('orders').insert(toOrderInsert(f)).select('id').single();
    if (ins.error || !ins.data) { setBusy(false); setError(errorMessage(ins.error?.message ?? '') || '오더를 접수하지 못했어요. 잠시 뒤 다시 해 주세요.'); return; }
    const orderId = ins.data.id as string;
    const problems: string[] = [];
    if (f.waypoints.length) {
      const w = await supabase.from('order_waypoints').insert(toWaypointRows(orderId, f.waypoints));
      if (w.error) problems.push('경유지');
    }
    if (ms.length) {
      const r = await supabase.from('order_missions').insert(ms.map(m => ({ order_id: orderId, mission_id: m.id, extra_fare: m.extra_fare })));
      if (r.error) problems.push('미션');
    }
    setBusy(false);
    setForm(blankForm(companyId, defaultPay));
    setEdited(null); setFareText(''); setReserve({ on: false, ...defaultReserve() });
    router.push(`/order/${orderId}${problems.length ? `?warn=${encodeURIComponent(problems.join('·'))}` : ''}` as Href);
  }

  return (
    <Screen>
      <Title>오더 접수</Title>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="탁송" on={form.kind === 'takson'} onPress={() => set({ kind: 'takson' })} />
        <Chip label="대리" on={form.kind === 'daeri'} onPress={() => set({ kind: 'daeri' })} />
      </View>

      <PlaceInput title="출발지" value={form.pickup} onChange={pickup => set({ pickup })} top={top} />
      {form.waypoints.map((w, i) => (
        <PlaceInput key={i} title={`경유지 ${i + 1}`} value={w} top={top}
          onChange={p => set({ waypoints: form.waypoints.map((x, j) => (j === i ? p : x)) })}
          onRemove={() => set({ waypoints: form.waypoints.filter((_, j) => j !== i) })} />
      ))}
      <BigButton label="경유지 추가" tone="plain" onPress={() => set({ waypoints: [...form.waypoints, emptyPlace()] })} />
      <PlaceInput title="도착지" value={form.dropoff} onChange={dropoff => set({ dropoff })} top={top} />

      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', color: color.text }}>차량</Text>
        <Field label="차량번호 (필수)" value={form.vehicleNumber} onChangeText={vehicleNumber => set({ vehicleNumber })} placeholder="12가3456" />
        <Field label="차종" value={form.vehicleModel} onChangeText={vehicleModel => set({ vehicleModel })} />
        <Field label="색상" value={form.vehicleColor} onChangeText={vehicleColor => set({ vehicleColor })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="변속기 모름" on={form.transmission === ''} onPress={() => set({ transmission: '' })} />
          <Chip label="오토" on={form.transmission === 'auto'} onPress={() => set({ transmission: 'auto' })} />
          <Chip label="수동" on={form.transmission === 'manual'} onPress={() => set({ transmission: 'manual' })} />
        </View>
        <Field label="기사 메모" value={form.driverMemo} onChangeText={driverMemo => set({ driverMemo })} multiline placeholder="기사님께 남길 말" />
      </Card>

      {missions.length > 0 && (
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700', color: color.text }}>미션 (선택)</Text>
          {missions.map(m => {
            const on = form.missionIds.includes(m.id);
            return (
              <Chip key={m.id} label={`${on ? '✓ ' : ''}${m.name}${m.extra_fare ? ` +${won(m.extra_fare)}` : ''}`} on={on}
                onPress={() => set({ missionIds: on ? form.missionIds.filter(x => x !== m.id) : [...form.missionIds, m.id] })} />
            );
          })}
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="바로" on={!reserve.on} onPress={() => setReserve(r => ({ ...r, on: false }))} />
          <Chip label="예약" on={reserve.on} onPress={() => setReserve(r => ({ ...r, on: true }))} />
        </View>
        {reserve.on && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 3 }}><Field label="날짜" value={reserve.date} onChangeText={date => setReserve(r => ({ ...r, date }))} placeholder="2026-11-20" /></View>
            <View style={{ flex: 2 }}><Field label="시간" value={reserve.time} onChangeText={time => setReserve(r => ({ ...r, time }))} placeholder="14:00" /></View>
          </View>
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="후불" on={form.paymentMethod === 'postpaid'} onPress={() => set({ paymentMethod: 'postpaid' })} />
          <Chip label="현금" on={form.paymentMethod === 'cash'} onPress={() => set({ paymentMethod: 'cash' })} />
        </View>
        <Body sub>{km !== null ? `거리 ${km}km · 자동 요금 ${fs.auto !== null ? won(fs.auto) : '-'}` : stops.some(p => !p.address) ? '주소를 다 고르면 요금이 계산돼요.' : routeFailed ? '' : '거리 계산 중…'}</Body>
        {fs.note && <Notice>{fs.note}</Notice>}
        <Field label="요금 (원)" keyboardType="number-pad"
          value={fareText !== '' ? fareText : fs.fare !== null ? String(fs.fare) : ''}
          onChangeText={t => {
            const digits = t.replace(/[^0-9]/g, '');
            setFareText(digits);
            setEdited(digits === '' ? null : Number(digits));
          }} />
        {edited !== null && fs.auto !== null && edited !== fs.auto && (
          <Pressable accessibilityRole="button" onPress={() => { setEdited(null); setFareText(''); }}>
            <Text style={{ fontSize: 15, color: color.primary }}>자동 요금({won(fs.auto)})으로 되돌리기</Text>
          </Pressable>
        )}
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}
      <BigButton label={fs.fare !== null ? `접수하기 · ${won(fs.fare)}` : '접수하기'} onPress={() => void submit()} busy={busy} />
    </Screen>
  );
}
