import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { CameraCapture } from '@/components/CameraCapture';
import { SLOT_LABEL } from '@/components/PhotoSlots';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import type { Phase, Slot } from '@/lib/photos/queue';

/** 사진 칸을 차례로 찍는 화면. slots=front,back,... 순서대로, 다 찍으면 돌아간다. extra는 한 장 */
export default function OrderCamera() {
  const { id, phase, slots } = useLocalSearchParams<{ id: string; phase: Phase; slots: string }>();
  const { add } = usePhotoQueue();
  const [todo, setTodo] = useState<string[]>(() => (slots ?? '').split(',').filter(Boolean));
  const current = todo[0];
  if (!current) return null;
  const isExtra = phase === 'extra';
  const label = isExtra ? '추가 사진' : `${phase === 'pickup' ? '출발' : '도착'} · ${SLOT_LABEL[current as Slot]}${current === 'dashboard' ? ' (주행거리·연료 보이게)' : ''}`;

  return (
    <CameraCapture key={current} label={`${label}${todo.length > 1 ? `  (남은 ${todo.length}장)` : ''}`}
      onCancel={() => router.back()}
      onShot={async (uri, size) => {
        await add({ uri, ...size }, { kind: 'photo', orderId: id, phase, slot: isExtra ? null : (current as Slot) });
        const rest = todo.slice(1);
        if (rest.length === 0) router.back();
        else setTodo(rest);
      }} />
  );
}
