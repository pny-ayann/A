import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { CameraCapture } from '@/components/CameraCapture';
import { SLOT_LABEL } from '@/components/PhotoSlots';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import type { Phase, Slot } from '@/lib/photos/queue';

/**
 * 사진 칸을 차례로 찍는 화면. slots=front,back,... 순서대로, 다 찍으면 돌아간다. extra는 한 장.
 * 서류(phase=docs)는 labels=칸 이름들('|'로 구분, slots와 같은 순서)을 함께 받는다.
 */
export default function OrderCamera() {
  const { id, phase, slots, labels } = useLocalSearchParams<{ id: string; phase: Phase; slots: string; labels?: string }>();
  const { add } = usePhotoQueue();
  const [todo, setTodo] = useState<string[]>(() => (slots ?? '').split(',').filter(Boolean));
  const [names] = useState<Record<string, string>>(() => {
    const list = (slots ?? '').split(',').filter(Boolean);
    const ls = (labels ?? '').split('|');
    return Object.fromEntries(list.map((s, i) => [s, ls[i] ?? '서류']));
  });
  const current = todo[0];
  if (!current) return null;
  const isExtra = phase === 'extra';
  const label = isExtra ? '추가 사진'
    : phase === 'docs' ? `서류 · ${names[current]}`
    : `${phase === 'pickup' ? '출발' : '도착'} · ${SLOT_LABEL[current as Slot]}${current === 'dashboard' ? ' (주행거리·연료 보이게)' : ''}`;

  return (
    <CameraCapture key={current} label={`${label}${todo.length > 1 ? `  (남은 ${todo.length}장)` : ''}`}
      frame={isExtra ? undefined : phase === 'docs' ? 'doc' : 'car'}
      onCancel={() => router.back()}
      onShot={async (uri, size) => {
        await add({ uri, ...size }, { kind: 'photo', orderId: id, phase, slot: isExtra ? null : current });
        const rest = todo.slice(1);
        if (rest.length === 0) router.back();
        else setTodo(rest);
      }} />
  );
}
