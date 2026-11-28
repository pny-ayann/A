import { errorMessage } from '@takson/shared';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DocInfo } from '@/lib/orders/useOrder';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import { lostReasons } from '@/lib/photos/queue';
import { supabase } from '@/lib/supabase';
import { BigButton, color, Notice } from '@/ui/kit';

/** 칸 이름 (slot: 'registration' | 'seal' | 캐피탈 예시 id) */
export function docLabel(slot: string, examples: { id: string; title: string }[]): string {
  if (slot === 'registration') return '자동차등록증';
  if (slot === 'seal') return '인감(본인서명사실확인서)';
  return examples.find(e => e.id === slot)?.title ?? '캐피탈 서류';
}

/**
 * 서류탁송 서류 사진 카드: 칸마다 찍기 / 관제 확인 중 / ✓ 인정 / ✗ 불인정(이유), 인감 수량, 작성 예시 보기.
 * 칸 목록은 서버(required_doc_slots)와 같게: 등록증, 인감, 표지가 아닌 캐피탈 예시 순서.
 */
export function DocSlots({ orderId, docs, sealCount, capitalId, reload }: {
  orderId: string; docs: DocInfo; sealCount: number | null; capitalId: string | null; reload: () => Promise<void>;
}) {
  const { items, lost } = usePhotoQueue();
  const lostDocs = lostReasons(lost, orderId, 'docs', docs.state.missing);
  const [count, setCount] = useState(sealCount ? String(sealCount) : '');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slots = ['registration', 'seal', ...docs.examples.filter(e => !e.is_cover).map(e => e.id)];
  const queued = (s: string) => items.some(i => i.orderId === orderId && i.phase === 'docs' && i.slot === s);
  const state = (s: string) => {
    if (queued(s)) return { key: 'queued' as const, text: '올리는 중' };
    const r = docs.state.rejected.find(x => x.slot === s);
    if (r) return { key: 'rejected' as const, text: `✗ 불인정 · ${r.reason}` };
    if (lostDocs[s]) return { key: 'rejected' as const, text: '✗ 다시 찍기 · 파일 없음' };
    if (docs.state.missing.includes(s)) return { key: 'empty' as const, text: '찍기' };
    if (docs.state.pending.includes(s)) return { key: 'pending' as const, text: '관제 확인 중' };
    return { key: 'ok' as const, text: '✓ 인정' };
  };
  const shoot = (list: string[]) => router.push(
    `/order/${orderId}/camera?phase=docs&slots=${list.join(',')}&labels=${encodeURIComponent(list.map(s => docLabel(s, docs.examples)).join('|'))}` as Href);
  const todo = slots.filter(s => ['empty', 'rejected'].includes(state(s).key));

  async function saveCount() {
    const n = Number(count);
    setMsg(null);
    if (!Number.isInteger(n) || n < 1) { setMsg('인감 수량을 1 이상 숫자로 적어 주세요.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('set_seal_count', { p_order_id: orderId, p_count: n });
    setSaving(false);
    if (error) { setMsg(errorMessage(error.message)); return; }
    await reload();
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.head}>서류 사진{docs.capitalName ? ` · ${docs.capitalName}` : ''}</Text>
      <Text style={s.sub}>서류 네 모서리가 다 보이게, 반듯하게 찍어 주세요. 관제가 확인해야 출발할 수 있어요.</Text>
      <View style={s.grid}>
        {slots.map(slot => {
          const st = state(slot);
          return (
            <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`${docLabel(slot, docs.examples)} 사진`}
              onPress={() => shoot([slot])}
              style={[s.cell, st.key === 'ok' && s.ok, (st.key === 'pending' || st.key === 'queued') && s.wait, st.key === 'rejected' && s.bad]}>
              <Text style={s.cellLabel} numberOfLines={2}>{docLabel(slot, docs.examples)}</Text>
              <Text style={[s.cellState, st.key === 'rejected' && { color: color.danger, fontWeight: '700' }]} numberOfLines={3}>{st.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {todo.length > 0 && <BigButton label={`서류 ${todo.length}장 이어서 찍기`} onPress={() => shoot(todo)} />}
      <View style={s.row}>
        <Text style={s.label}>인감 수량</Text>
        <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" accessibilityLabel="인감 수량"
          placeholder="0" placeholderTextColor={color.sub} style={s.input} />
        <Text style={s.label}>장</Text>
        <View style={{ flex: 1 }}>
          <BigButton label={sealCount ? '수량 고치기' : '수량 저장'} tone="plain" busy={saving} onPress={() => void saveCount()} />
        </View>
      </View>
      {msg && <Notice tone="danger">{msg}</Notice>}
      {capitalId && <BigButton label="작성방법 예시 보기" tone="plain" onPress={() => router.push(`/examples/${capitalId}` as Href)} />}
    </View>
  );
}

const s = StyleSheet.create({
  head: { fontSize: 17, fontWeight: '700', color: color.text },
  sub: { fontSize: 15, color: color.sub },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48%', minHeight: 80, padding: 8, borderRadius: 12, borderWidth: 2, borderColor: color.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 4 },
  ok: { borderColor: color.ok, borderStyle: 'solid', backgroundColor: '#ECFDF5' },
  wait: { borderColor: color.warn, borderStyle: 'solid', backgroundColor: color.warnBg },
  bad: { borderColor: color.danger, borderStyle: 'solid', backgroundColor: '#FEF2F2' },
  cellLabel: { fontSize: 16, fontWeight: '700', color: color.text, textAlign: 'center' },
  cellState: { fontSize: 14, color: color.sub, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 17, fontWeight: '700', color: color.text },
  input: { width: 64, minHeight: 48, borderWidth: 1, borderColor: color.line, borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 10, fontSize: 18, textAlign: 'center', color: color.text },
});
