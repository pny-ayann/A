import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraCapture } from '@/components/CameraCapture';
import { useAuth } from '@/lib/auth/AuthProvider';
import { parseAmount } from '@/lib/orders/fuel';
import { useOrder } from '@/lib/orders/useOrder';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import { supabase } from '@/lib/supabase';
import { kstShort, won } from '@/lib/time';
import { BigButton, Body, Card, color, Field, Notice } from '@/ui/kit';

type Receipt = { id: string; amount: number; created_at: string };

/** 주유 등록: 금액 → 영수증 촬영 → 대기열(신호 없으면 나중에 올라감). 오더수락 뒤·운행 중에만 */
export default function Fuel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { order } = useOrder(id, profile?.id);
  const queue = usePhotoQueue();
  const [list, setList] = useState<Receipt[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shooting, setShooting] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('fuel_receipts').select('id, amount, created_at')
      .eq('order_id', id).order('created_at', { ascending: false });
    if (data) setList(data as Receipt[]);
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (queue.uploadedTick > 0) void load(); }, [queue.uploadedTick, load]);

  const waiting = queue.items.filter(i => i.kind === 'receipt' && i.orderId === id);
  const open = order?.status === 'arrived_pickup' || order?.status === 'driving';

  if (shooting !== null) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CameraCapture label={`주유 영수증 · ${won(shooting)}`} onCancel={() => setShooting(null)}
          onShot={async (uri, size) => {
            await queue.add({ uri, ...size }, { kind: 'receipt', orderId: id, amount: shooting });
            setShooting(null);
            setText('');
            setSaved(true);
          }} />
      </>
    );
  }

  function start() {
    setSaved(false);
    const n = parseAmount(text);
    if (n === null) { setError('주유 금액을 숫자로 적어 주세요. (예: 45000)'); return; }
    setError(null);
    setShooting(n);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: true, title: '주유 등록' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {order && !open && <Notice>주유 등록은 오더수락 뒤부터 운행 중까지만 할 수 있어요.</Notice>}
        {open && (
          <Card>
            <Field label="주유 금액 (원)" value={text} onChangeText={setText} keyboardType="number-pad" placeholder="예: 45000" />
            {error && <Notice tone="danger">{error}</Notice>}
            <BigButton label="영수증 찍고 등록" onPress={start} />
          </Card>
        )}
        {saved && <Notice tone="ok">등록했어요. 신호가 잡히면 관제에 저절로 올라가요.</Notice>}
        <Card>
          <Body style={{ fontWeight: '700' }}>이 오더 주유 내역</Body>
          {waiting.map(w => (
            <Row key={w.id} left={`${won(w.amount ?? 0)}`} right="업로드 대기" warn />
          ))}
          {list.map(r => <Row key={r.id} left={won(r.amount)} right={`${kstShort(r.created_at)} · 올림`} />)}
          {waiting.length === 0 && list.length === 0 && <Body sub>아직 없어요.</Body>}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ left, right, warn }: { left: string; right: string; warn?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: color.text }}>{left}</Text>
      <Text style={{ fontSize: 16, color: warn ? color.warn : color.sub }}>{right}</Text>
    </View>
  );
}
