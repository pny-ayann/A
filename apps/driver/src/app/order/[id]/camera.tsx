import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { CameraCapture } from '@/components/CameraCapture';
import { SLOT_LABEL } from '@/components/PhotoSlots';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import type { Phase, Slot } from '@/lib/photos/queue';
import { galleryRun, parseSteps } from '@/lib/photos/steps';

/**
 * 사진 칸을 차례로 찍는 화면. 다 찍으면 돌아간다. extra는 한 장.
 * slots=front,back,... (phase 단계) 또는 slots=docs:registration,pickup:front,... (서류 다음 출발 사진처럼 이어 찍기).
 * 서류 칸은 labels=칸 이름들('|'로 구분, slots와 같은 순서)을 함께 받는다.
 * 갤러리에서 여러 장을 고르면 지금 단계의 남은 칸에만 채운다 (서류·차량 사진이 섞이지 않게).
 */
export default function OrderCamera() {
  const { id, phase, slots, labels } = useLocalSearchParams<{ id: string; phase: Phase; slots: string; labels?: string }>();
  const { add } = usePhotoQueue();
  const [todo, setTodo] = useState(() => parseSteps(slots ?? '', phase));
  const [names] = useState<Record<string, string>>(() => {
    const ls = (labels ?? '').split('|');
    return Object.fromEntries(parseSteps(slots ?? '', phase).map((s, i) => [`${s.phase}:${s.slot}`, ls[i] || '서류']));
  });
  const current = todo[0];
  if (!current) return null;
  const isExtra = current.phase === 'extra';
  const label = isExtra ? '추가 사진'
    : current.phase === 'docs' ? `서류 · ${names[`docs:${current.slot}`]}`
    : `${current.phase === 'pickup' ? '출발' : '도착'} · ${SLOT_LABEL[current.slot as Slot]}${current.slot === 'dashboard' ? ' (주행거리·연료 보이게)' : ''}`;
  const next = (done: number) => {
    const rest = todo.slice(done);
    if (rest.length === 0) router.back();
    else setTodo(rest);
  };

  return (
    <CameraCapture key={`${current.phase}:${current.slot}`} label={`${label}${todo.length > 1 ? `  (남은 ${todo.length}장)` : ''}`}
      frame={isExtra ? undefined : current.phase === 'docs' ? 'doc' : 'car'}
      onCancel={() => router.back()}
      onGallery={async () => {
        // 갤러리 모듈이 없는 옛 개발용 앱에서도 카메라 화면이 죽지 않게, 누를 때만 불러온다
        let ImagePicker: typeof import('expo-image-picker');
        try { ImagePicker = await import('expo-image-picker'); } catch {
          Alert.alert('앱을 새로 설치해 주세요', '갤러리에서 고르려면 새 버전 앱이 필요해요.', [{ text: '확인' }]);
          return;
        }
        // 고른 순서대로 지금 단계의 남은 칸에 채운다 (추가 사진은 장수 제한 없음)
        const run = galleryRun(todo);
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true,
          selectionLimit: isExtra ? 0 : run, quality: 1,
        });
        if (r.canceled) return;
        const picked = isExtra ? r.assets : r.assets.slice(0, run);
        for (const [n, a] of picked.entries()) {
          const step = todo[n]!;
          await add({ uri: a.uri, width: a.width, height: a.height },
            { kind: 'photo', orderId: id, phase: step.phase, slot: isExtra ? null : step.slot, fromGallery: true });
        }
        next(isExtra ? todo.length : picked.length);
      }}
      onShot={async (uri, size) => {
        await add({ uri, ...size }, { kind: 'photo', orderId: id, phase: current.phase, slot: isExtra ? null : current.slot });
        next(1);
      }} />
  );
}
