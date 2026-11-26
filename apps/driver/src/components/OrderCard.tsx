import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardView, type OpenOrder } from '@/lib/orders/list';
import { color } from '@/ui/kit';

/** 두 줄 카드: 1줄 거리 · 출발 → 도착, 2줄 예약·결제·미션 · 금액. 오른쪽 잡기 */
export function OrderCard({ order, onGrab, busy }: { order: OpenOrder; onGrab: () => void; busy: boolean }) {
  const v = cardView(order);
  const sub = [v.badge, v.pay, order.kind === 'daeri' ? '대리' : null, order.mission_names.length ? `미션 ${order.mission_names.length}` : null]
    .filter(Boolean).join(' · ');
  return (
    <View style={s.card}>
      <View style={s.body}>
        <View style={s.row}>
          <Text style={s.dist}>{v.distance}</Text>
          {/* 길면 두 줄까지: 도착지가 잘리지 않게 */}
          <Text style={s.route} numberOfLines={2}>{v.title}</Text>
        </View>
        <View style={s.row}>
          <Text style={[s.sub, order.reserved_at ? { color: color.warn, fontWeight: '700' } : null]} numberOfLines={1}>{sub}</Text>
          <Text style={s.fare}>{v.fare}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${v.title} 오더 잡기`} onPress={onGrab} disabled={busy}
        style={({ pressed }) => [s.grab, pressed && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.grabText}>잡기</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: color.card, borderRadius: 12, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderWidth: 1, borderColor: color.line },
  body: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dist: { flexShrink: 0, alignSelf: 'flex-start', fontSize: 15, fontWeight: '800', color: color.primary, backgroundColor: color.primarySoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  route: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.text },
  sub: { flex: 1, fontSize: 14, color: color.sub },
  fare: { fontSize: 19, fontWeight: '800', color: color.text },
  grab: { minWidth: 64, minHeight: 56, borderRadius: 10, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  grabText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
