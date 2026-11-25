import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** 현장용: 큰 버튼, 큰 글자, 또렷한 색. 도로 표지판 초록 + 아스팔트 글자 + 영업용 번호판 노랑 */
export const color = {
  bg: '#F0F1EE',
  card: '#FFFFFF',
  text: '#1C2127',
  sub: '#5A6068',
  line: '#D5D8D2',
  primary: '#0A6B4B',
  primarySoft: '#E3F1EA',
  danger: '#C62828',
  ok: '#15803D',
  warn: '#9A5B00',
  warnBg: '#FFF4CC',
  plate: '#F6C800',
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        : <View style={[s.pad, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Body({ children, sub, style }: { children: ReactNode; sub?: boolean; style?: object }) {
  return <Text style={[s.body, sub && { color: color.sub }, style]}>{children}</Text>;
}

export function BigButton({ label, onPress, disabled, busy, tone = 'primary', hint }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean;
  tone?: 'primary' | 'danger' | 'plain'; hint?: string | null;
}) {
  const bg = tone === 'primary' ? color.primary : tone === 'danger' ? color.danger : color.card;
  const fg = tone === 'plain' ? color.text : '#fff';
  const off = disabled || busy;
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off }}
        onPress={off ? undefined : onPress}
        style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: off ? 0.45 : pressed ? 0.8 : 1 },
          tone === 'plain' && { borderWidth: 1.5, borderColor: color.text }]}>
        {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{label}</Text>}
      </Pressable>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Field({ label, ...rest }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#9AA0A6" style={s.input} {...rest} />
    </View>
  );
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'ok' }) {
  const fg = tone === 'danger' ? color.danger : tone === 'ok' ? color.ok : color.warn;
  return <Text style={[s.notice, { color: fg, borderLeftColor: fg }]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

/** 차량번호를 영업용 번호판(노랑 바탕, 검은 글자)처럼 보여 준다 */
export function Plate({ number }: { number: string | null | undefined }) {
  if (!number) return <Text style={[s.body, { color: color.sub }]}>차량번호 없음</Text>;
  return <Text style={s.plate} accessibilityLabel={`차량번호 ${number}`}>{number}</Text>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  pad: { padding: 16, gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: color.text, letterSpacing: -0.4 },
  body: { fontSize: 17, color: color.text, lineHeight: 24 },
  btn: { minHeight: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontSize: 19, fontWeight: '800' },
  hint: { fontSize: 15, color: color.warn, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: '700', color: color.sub },
  input: { minHeight: 54, borderWidth: 1.5, borderColor: color.line, borderRadius: 8, paddingHorizontal: 14, fontSize: 18, backgroundColor: '#fff', color: color.text },
  notice: { fontSize: 16, borderLeftWidth: 5, borderRadius: 6, padding: 12, backgroundColor: '#fff', overflow: 'hidden' },
  card: { backgroundColor: color.card, borderRadius: 10, padding: 16, gap: 8, borderWidth: 1, borderColor: color.line },
  plate: { alignSelf: 'flex-start', backgroundColor: color.plate, color: color.text, borderWidth: 2, borderColor: color.text, borderRadius: 5,
    paddingHorizontal: 10, paddingVertical: 2, fontSize: 18, fontWeight: '800', letterSpacing: 0.5, overflow: 'hidden' },
});
