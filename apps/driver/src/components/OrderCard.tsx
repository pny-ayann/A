import { StyleSheet, Text, View } from 'react-native';
import { cardView, type OpenOrder } from '@/lib/orders/list';
import { BigButton, color } from '@/ui/kit';

export function OrderCard({ order, onGrab, busy }: { order: OpenOrder; onGrab: () => void; busy: boolean }) {
  const v = cardView(order);
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={s.kind}>{v.kindLabel}</Text>
        {v.badge && <Text style={s.badge}>{v.badge}</Text>}
        <Text style={[s.pay, v.pay === '현금' && { color: color.ok, borderColor: color.ok }]}>{v.pay}</Text>
      </View>
      <Text style={s.title}>{v.title}</Text>
      <View style={s.row}>
        <Text style={s.fare}>{v.fare}</Text>
        <Text style={s.dist}>내 위치에서 {v.distance}</Text>
      </View>
      {order.mission_names.length > 0 && <Text style={s.sub}>미션: {order.mission_names.join(', ')}</Text>}
      <BigButton label="잡기" onPress={onGrab} busy={busy} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: color.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kind: { fontSize: 15, fontWeight: '700', color: color.sub },
  badge: { fontSize: 17, fontWeight: '800', color: '#fff', backgroundColor: color.warn, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  pay: { marginLeft: 'auto', fontSize: 15, fontWeight: '700', color: color.primary, borderWidth: 1, borderColor: color.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  title: { fontSize: 20, fontWeight: '700', color: color.text },
  fare: { fontSize: 22, fontWeight: '800', color: color.text },
  dist: { marginLeft: 'auto', fontSize: 16, color: color.sub },
  sub: { fontSize: 15, color: color.sub },
});
