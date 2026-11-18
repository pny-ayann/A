import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton, Body, color } from '@/ui/kit';

/**
 * 앱 안 카메라로만 찍는 전체 화면 촬영기. 갤러리에서 고르는 길은 없다 (설계 6.3).
 * onShot에는 찍은 원본(임시 파일)의 주소와 크기가 온다.
 */
export function CameraCapture({ label, onShot, onCancel }: {
  label: string;
  onShot: (uri: string, size: { width: number; height: number }) => void | Promise<void>;
  onCancel: () => void;
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
      <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
        <Text style={s.label}>{label}</Text>
        <View style={{ gap: 10 }}>
          <BigButton label="찍기" onPress={shoot} disabled={!ready} busy={busy} />
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
  label: { alignSelf: 'center', color: '#fff', fontSize: 22, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
});
