import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { navLinks, telLink } from '@/lib/orders/nav';
import type { Stop } from '@/lib/orders/useOrder';
import { color } from '@/ui/kit';

/** 앱 길안내를 열고, 앱이 없으면 카카오맵 웹으로 */
async function open(url: string | null, fallback: string) {
  if (!url) { await Linking.openURL(fallback); return; }
  try { await Linking.openURL(url); } catch { await Linking.openURL(fallback); }
}

/** 출발·경유·도착 한 곳: 주소, 담당자, 길안내·전화 버튼 */
export function StopBlock({ title, stop }: { title: string; stop: Stop }) {
  const links = navLinks({ lat: stop.lat, lng: stop.lng, name: stop.area || stop.address, address: stop.address });
  const tel = telLink(stop.contact_phone);
  return (
    <View style={s.box}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.addr}>{stop.address}{stop.detail ? `\n${stop.detail}` : ''}</Text>
      {(stop.contact_name || stop.contact_phone) ? <Text style={s.sub}>{stop.contact_name ?? ''} {stop.contact_phone ?? ''}</Text> : null}
      <View style={s.row}>
        <Chip label="카카오맵" onPress={() => void open(links.kakao, links.web)} />
        <Chip label="티맵" onPress={() => void open(links.tmap, links.web)} />
        {tel ? <Chip label="전화" onPress={() => void Linking.openURL(tel)} /> : null}
      </View>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [s.chip, pressed && { opacity: 0.7 }]}>
      <Text style={s.chipText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: { gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: color.line },
  title: { fontSize: 15, fontWeight: '700', color: color.sub },
  addr: { fontSize: 19, fontWeight: '600', color: color.text, lineHeight: 26 },
  sub: { fontSize: 16, color: color.sub },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: 48, minWidth: 88, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: color.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  chipText: { fontSize: 17, fontWeight: '700', color: color.primary },
});
