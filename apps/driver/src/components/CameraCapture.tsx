import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton, Body, color } from '@/ui/kit';

/**
 * 앱 안 카메라로 찍는 전체 화면 촬영기. onGallery를 주면 갤러리에서 고르는 버튼도 보인다 (갤러리 사진은 관제에 표시됨).
 * onShot에는 찍은 원본(임시 파일)의 주소와 크기가 온다.
 */
/** frame: 화면에 맞춤 테두리 (차량 = 가로 넓게, 서류 = A4 세로) */
const FRAME = {
  car: { box: { width: '92%', aspectRatio: 1.6 }, hint: '차 전체가 테두리 안에 들어오게 찍어 주세요' },
  doc: { box: { width: '80%', aspectRatio: 0.707 }, hint: '서류 네 모서리가 테두리 안에 들어오게 찍어 주세요' },
} as const;

export function CameraCapture({ label, onShot, onCancel, frame, onGallery }: {
  label: string;
  onShot: (uri: string, size: { width: number; height: number }) => void | Promise<void>;
  onCancel: () => void;
  frame?: 'car' | 'doc';
  /** 휴대폰 갤러리에서 고르기 (없으면 버튼 숨김) */
  onGallery?: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!permission) return <View style={s.full} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[s.full, s.pad]}>
        <Body>사진을 찍으려면 카메라를 허용해 주세요.</Body>
        {permission.canAskAgain
          ? <BigButton label="카메라 허용" onPress={requestPermission} />
          : <BigButton label="설정 열기" onPress={() => void Linking.openSettings()} />}
        {onGallery && <BigButton label="갤러리에서 고르기" tone="plain" onPress={onGallery} />}
        <BigButton label="취소" tone="plain" onPress={onCancel} />
      </SafeAreaView>
    );
  }

  async function shoot() {
    if (!cam.current || busy) return;
    setBusy(true);
    try {
      const p = await cam.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      if (p) await onShot(p.uri, { width: p.width, height: p.height });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.full}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      {frame && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]}>
          <View style={[s.frame, FRAME[frame].box]} />
        </View>
      )}
      <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Text style={s.label}>{label}</Text>
          {frame && <Text style={s.hint}>{FRAME[frame].hint}</Text>}
        </View>
        <View style={{ gap: 10 }}>
          <BigButton label="찍기" onPress={shoot} disabled={!ready} busy={busy} />
          {onGallery && <BigButton label="갤러리에서 고르기" tone="plain" onPress={onGallery} disabled={busy} />}
          <BigButton label="취소" tone="plain" onPress={onCancel} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  pad: { padding: 16, gap: 14, backgroundColor: color.bg },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center' },
  frame: { borderWidth: 3, borderColor: '#FFD400', borderRadius: 12 },
  hint: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  label: { alignSelf: 'center', color: '#fff', fontSize: 22, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
});
