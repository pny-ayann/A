import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { CameraCapture } from '@/components/CameraCapture';
import { SLOT_LABEL } from '@/components/PhotoSlots';
import { usePhotoQueue } from '@/lib/photos/PhotoQueueProvider';
import type { Phase, Slot } from '@/lib/photos/queue';

/**
 * 사진 칸을 차례로 찍는 화면. 갤러리에서 여러 장을 골라 남은 칸에 한 번에 채울 수도 있다. slots=front,back,... 순서대로, 다 찍으면 돌아간다. extra는 한 장.
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
      onGallery={async () => {
        // 갤러리 모듈이 없는 옛 개발용 앱에서도 카메라 화면이 죽지 않게, 누를 때만 불러온다
        let ImagePicker: typeof import('expo-image-picker');
        try { ImagePicker = await import('expo-image-picker'); } catch {
          Alert.alert('앱을 새로 설치해 주세요', '갤러리에서 고르려면 새 버전 앱이 필요해요.', [{ text: '확인' }]);
          return;
        }
        // 고른 순서대로 남은 칸에 채운다 (추가 사진은 장수 제한 없음)
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true,
          selectionLimit: isExtra ? 0 : todo.length, quality: 1,
        });
        if (r.canceled) return;
        const picked = isExtra ? r.assets : r.assets.slice(0, todo.length);
        for (const [n, a] of picked.entries()) {
          await add({ uri: a.uri, width: a.width, height: a.height },
            { kind: 'photo', orderId: id, phase, slot: isExtra ? null : todo[n]!, fromGallery: true });
        }
        const rest = isExtra ? [] : todo.slice(picked.length);
        if (rest.length === 0) router.back();
        else setTodo(rest);
      }}
      onShot={async (uri, size) => {
        await add({ uri, ...size }, { kind: 'photo', orderId: id, phase, slot: isExtra ? null : current });
        const rest = todo.slice(1);
        if (rest.length === 0) router.back();
        else setTodo(rest);
      }} />
  );
}
