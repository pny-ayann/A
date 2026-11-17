import { errorMessage } from '@takson/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StopBlock } from '@/components/StopBlock';
import { useAuth } from '@/lib/auth/AuthProvider';
import { currentPosition } from '@/lib/location/current';
import { nextAction, releaseRemainingMs } from '@/lib/orders/progress';
import { useOrder } from '@/lib/orders/useOrder';
import { supabase } from '@/lib/supabase';
import { kstShort, won } from '@/lib/time';
import { BigButton, Body, Card, color, Field, Notice } from '@/ui/kit';

const STATUS_LABEL = {
  open: '접수', assigned: '배차됨', arrived_pickup: '출발지 도착', driving: '운행 중', completed: '완료', cancelled: '취소',
} as const;

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { order, missing, gone, settings, reload } = useOrder(id, profile?.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'danger' } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (gone) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 14, backgroundColor: color.bg }} edges={['left', 'right', 'bottom']}>
        <Notice>이 오더는 더 이상 기사님 오더가 아니에요. (관제가 회수·취소했거나 반납했어요)</Notice>
        <BigButton label="주문 목록으로" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }
  if (!order) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  const pendingUploads = 0; // Task 5에서 휴대폰 업로드 대기 수로 바꿈
  const action = nextAction(order.status, missing, pendingUploads);
  const canRelease = order.assigned_at && (order.status === 'assigned' || order.status === 'arrived_pickup');
  const releaseLeft = canRelease ? releaseRemainingMs(order.assigned_at!, order.kind, settings, now) : 0;
  const mmss = `${Math.floor(releaseLeft / 60000)}:${String(Math.floor(releaseLeft / 1000) % 60).padStart(2, '0')}`;
  const done = order.status === 'completed';

  async function advance() {
    setBusy(true);
    setMessage(null);
    const pos = await currentPosition();
    const { error } = await supabase.rpc('advance_order', { p_order_id: id, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null });
    setBusy(false);
    if (error) setMessage({ text: errorMessage(error.message), tone: 'danger' });
    await reload();
  }

  async function release() {
    if (!reason.trim()) { setMessage({ text: errorMessage('REASON_REQUIRED'), tone: 'danger' }); return; }
    setBusy(true);
    const { error } = await supabase.rpc('release_order', { p_order_id: id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setMessage({ text: errorMessage(error.message), tone: 'danger' }); await reload(); return; }
    router.replace('/');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: done ? color.ok : color.primary }}>{STATUS_LABEL[order.status]}</Text>
            <Text style={{ fontSize: 16, color: color.sub }}>{order.kind === 'daeri' ? '대리' : '탁송'}</Text>
            {order.reserved_at ? <Text style={{ fontSize: 16, fontWeight: '800', color: color.warn }}>[예약] {kstShort(order.reserved_at)}</Text> : null}
            <Text style={{ marginLeft: 'auto', fontSize: 20, fontWeight: '800', color: color.text }}>
              {won(order.fare)} · {order.payment_method === 'cash' ? '현금' : '후불'}
            </Text>
          </View>
          <StopBlock title="출발지" stop={order.pickup} />
          {order.waypoints.map((w, i) => <StopBlock key={i} title={`경유지 ${i + 1}`} stop={w} />)}
          <StopBlock title="도착지" stop={order.dropoff} />
        </Card>
        <Card>
          <Body style={{ fontWeight: '700' }}>차량</Body>
          <Body>{[order.vehicle_number, order.vehicle_model, order.vehicle_color,
            order.transmission === 'auto' ? '오토' : order.transmission === 'manual' ? '수동' : null].filter(Boolean).join(' · ') || '정보 없음'}</Body>
          {order.missions.length > 0 ? <Body>미션: {order.missions.join(', ')}</Body> : null}
          {order.driver_memo ? <Body>메모: {order.driver_memo}</Body> : null}
        </Card>
        {done && <Notice tone="ok">운행을 마쳤어요. 수고하셨어요!</Notice>}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {releaseLeft > 0 && !releasing && (
          <BigButton label={`반납 (남은 시간 ${mmss})`} tone="plain" onPress={() => { setMessage(null); setReleasing(true); }} />
        )}
        {releasing && releaseLeft > 0 && (
          <Card>
            <Field label="반납 사유" value={reason} onChangeText={setReason} placeholder="예: 출발지까지 너무 멀어요" />
            <BigButton label="반납하기" tone="danger" busy={busy} onPress={release} />
            <BigButton label="그만두기" tone="plain" onPress={() => setReleasing(false)} />
          </Card>
        )}
      </ScrollView>
      {action && (
        <View style={{ padding: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: '#fff' }}>
          <BigButton label={action.label} onPress={advance} disabled={!action.enabled} busy={busy} hint={action.hint} />
        </View>
      )}
    </SafeAreaView>
  );
}
