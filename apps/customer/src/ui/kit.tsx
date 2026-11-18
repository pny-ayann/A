import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** 현장용: 큰 버튼, 큰 글자, 또렷한 색 */
export const color = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#111827',
  sub: '#4B5563',
  line: '#D1D5DB',
  primary: '#1D4ED8',
  danger: '#DC2626',
  ok: '#15803D',
  warn: '#B45309',
  warnBg: '#FEF3C7',
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
          tone === 'plain' && { borderWidth: 1, borderColor: color.line }]}>
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
      <TextInput accessibilityLabel={label} placeholderTextColor="#9CA3AF" style={s.input} {...rest} />
    </View>
  );
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'ok' }) {
  const fg = tone === 'danger' ? color.danger : tone === 'ok' ? color.ok : color.warn;
  return <Text style={[s.notice, { color: fg, borderColor: fg }]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  pad: { padding: 16, gap: 14 },
  title: { fontSize: 24, fontWeight: '700', color: color.text },
  body: { fontSize: 17, color: color.text, lineHeight: 24 },
  btn: { minHeight: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontSize: 19, fontWeight: '700' },
  hint: { fontSize: 15, color: color.warn, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: color.sub },
  input: { minHeight: 54, borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingHorizontal: 14, fontSize: 18, backgroundColor: '#fff', color: color.text },
  notice: { fontSize: 16, borderWidth: 1, borderRadius: 10, padding: 12, backgroundColor: '#fff' },
  card: { backgroundColor: color.card, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: color.line },
});
