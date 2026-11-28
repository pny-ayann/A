import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import { lostReasons, type Slot } from '@/lib/photos/queue';
import { photoSlotState } from '@/lib/photos/slotState';
import { photoTodo } from '@/lib/photos/steps';
import { BigButton, color } from '@/ui/kit';

export const SLOTS: Slot[] = ['front', 'back', 'left', 'right', 'dashboard', 'key'];
export const SLOT_LABEL: Record<Slot, string> = { front: '앞', back: '뒤', left: '왼쪽', right: '오른쪽', dashboard: '계기판', key: '차키' };

/**
 * 출발·도착 필수 사진 6칸. 서버에 있음(✓) / 휴대폰에서 올리는 중(대기) / 없음(눌러서 찍기).
 * missing = 서버 missing_photos 결과
 */
export function PhotoSlots({ orderId, phase, missing, rejected = {} }: {
  orderId: string; phase: 'pickup' | 'dropoff'; missing: string[];
  /** 관제가 불인정한 칸 → 이유 */
  rejected?: Record<string, string>;
}) {
  const { items, lost } = usePhotoQueue();
  const queued = (s: Slot) => items.some(i => i.orderId === orderId && i.phase === phase && i.slot === s);
  // 휴대폰에서 파일을 잃은 칸도 빨간 칸(다시 찍기)으로
  const bad = { ...lostReasons(lost, orderId, phase, missing), ...rejected };
  const state = (s: Slot) => photoSlotState(s, missing, queued(s), bad);
  const todo = photoTodo(SLOTS, missing, s => queued(s as Slot), bad) as Slot[];
  const pendingAll = items.filter(i => i.orderId === orderId).length;

  const shoot = (slots: Slot[]) =>
    router.push(`/order/${orderId}/camera?phase=${phase}&slots=${slots.join(',')}` as Href);

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.head}>{phase === 'pickup' ? '출발 사진' : '도착 사진'} (6장 필수)</Text>
      {pendingAll > 0 && <Text style={s.pending}>업로드 대기 {pendingAll}장 · 신호가 잡히면 저절로 올라가요</Text>}
      <View style={s.grid}>
        {SLOTS.map(slot => {
          const st = state(slot);
          return (
            <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`${SLOT_LABEL[slot]} 사진`}
              onPress={() => shoot([slot])}
              style={[s.cell, st.key === 'done' && s.done, st.key === 'queued' && s.queued, st.key === 'rejected' && s.bad]}>
              <Text style={s.cellLabel}>{SLOT_LABEL[slot]}</Text>
              <Text style={[s.cellState, st.key === 'rejected' && s.badText]} numberOfLines={3}>{st.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {todo.length > 0 && <BigButton label={`빈 칸 ${todo.length}장 이어서 찍기`} onPress={() => shoot(todo)} />}
      <BigButton label="추가 사진 (흠집 등)" tone="plain"
        onPress={() => router.push(`/order/${orderId}/camera?phase=extra&slots=extra` as Href)} />
    </View>
  );
}

const s = StyleSheet.create({
  head: { fontSize: 17, fontWeight: '700', color: color.text },
  pending: { fontSize: 16, fontWeight: '700', color: color.warn, backgroundColor: color.warnBg, padding: 10, borderRadius: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31%', minHeight: 72, borderRadius: 12, borderWidth: 2, borderColor: color.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  done: { borderColor: color.ok, borderStyle: 'solid', backgroundColor: '#ECFDF5' },
  queued: { borderColor: color.warn, borderStyle: 'solid', backgroundColor: color.warnBg },
  bad: { borderColor: color.danger, borderStyle: 'solid', backgroundColor: '#FEF2F2' },
  badText: { color: color.danger, fontWeight: '700', textAlign: 'center' },
  cellLabel: { fontSize: 18, fontWeight: '700', color: color.text },
  cellState: { fontSize: 14, color: color.sub },
});
