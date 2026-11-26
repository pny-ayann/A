import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardView, type OpenOrder } from '@/lib/orders/list';
import { color } from '@/ui/kit';

/** 카드: 거리 · 출발 / → 도착, 아래 결제·예약·미션 · 금액. 오른쪽 수락 */
export function OrderCard({ order, onGrab, busy }: { order: OpenOrder; onGrab: () => void; busy: boolean }) {
  const v = cardView(order);
  const rest = [v.badge, order.kind === 'daeri' ? '대리' : null, order.mission_names.length ? `미션 ${order.mission_names.length}` : null]
    .filter(Boolean).join(' · ');
  return (
    <View style={s.card}>
      <View style={s.body}>
        {/* 출발·도착을 한 줄씩, 도착은 카드 폭을 다 쓴다: 좁은 화면에서도 잘리거나 단어 중간에서 끊기지 않게 */}
        <View style={s.row}>
          {/* 거리를 모르면 칸을 숨긴다 (위쪽 안내가 위치를 켜라고 알려 줌) */}
          {order.distance_km !== null && <Text style={s.dist}>{v.distance}</Text>}
          <Text style={s.route} numberOfLines={1}>{order.pickup_area || '출발지'}</Text>
        </View>
        <Text style={s.route} numberOfLines={1}>→ {order.dropoff_area || '도착지'}</Text>
        <View style={s.row}>
          <Text style={s.sub} numberOfLines={1}>
            <Text style={v.pay === '현금' ? s.cash : v.pay === '후불' ? s.later : null}>{v.pay}</Text>
            {rest ? <Text style={order.reserved_at ? s.reserved : null}> · {rest}</Text> : null}
          </Text>
          <Text style={s.fare}>{v.fare}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${v.title} 오더 수락`} onPress={onGrab} disabled={busy}
        style={({ pressed }) => [s.grab, pressed && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.grabText}>수락</Text>}
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
  sub: { flex: 1, fontSize: 15, color: color.sub },
  cash: { fontWeight: '800', color: color.ok },
  later: { fontWeight: '800', color: color.danger },
  reserved: { fontWeight: '700', color: color.warn },
  fare: { fontSize: 19, fontWeight: '800', color: color.text },
  grab: { minWidth: 64, minHeight: 56, borderRadius: 10, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  grabText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
