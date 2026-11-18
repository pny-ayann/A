import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { CameraCapture } from '@/components/CameraCapture';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DOC_LABEL, myDocuments, uploadDocument, type DocKind } from '@/lib/auth/documents';
import { BigButton, Body, Card, Notice, Screen, Title } from '@/ui/kit';

const KINDS: DocKind[] = ['license', 'insurance'];

export default function Pending() {
  const { route, profile, reload, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<DocKind[]>([]);
  const [shooting, setShooting] = useState<DocKind | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'danger' } | null>(null);
  const suspended = route === 'suspended';

  const refreshDocs = useCallback(async () => {
    if (profile) setDocs(await myDocuments(profile.id));
  }, [profile]);
  useEffect(() => { void refreshDocs(); }, [refreshDocs]);

  if (shooting && profile) {
    return (
      <CameraCapture label={`${DOC_LABEL[shooting]} 찍기`} onCancel={() => setShooting(null)}
        onShot={async (uri, size) => {
          const problem = await uploadDocument(profile.id, shooting, uri, size);
          setMessage(problem ? { text: problem, tone: 'danger' } : { text: `${DOC_LABEL[shooting]}을 올렸어요.`, tone: 'ok' });
          setShooting(null);
          await refreshDocs();
        }} />
    );
  }

  return (
    <Screen>
      <Title>{suspended ? '이용이 정지됐어요' : '승인을 기다리고 있어요'}</Title>
      <Body>{profile?.name ? `${profile.name} 기사님, ` : ''}{suspended
        ? '관제에 문의해 주세요.'
        : '관제가 서류를 확인하고 승인하면 오더를 받을 수 있어요.'}</Body>
      {!suspended && (
        <Card>
          <Body style={{ fontWeight: '700' }}>제출 서류</Body>
          {KINDS.map(k => (
            <View key={k} style={{ gap: 6 }}>
              <Body>{DOC_LABEL[k]}: {docs.includes(k) ? '올림 ✓' : '아직 없음'}</Body>
              <BigButton label={docs.includes(k) ? `${DOC_LABEL[k]} 다시 찍기` : `${DOC_LABEL[k]} 찍기`}
                tone={docs.includes(k) ? 'plain' : 'primary'} onPress={() => { setMessage(null); setShooting(k); }} />
            </View>
          ))}
        </Card>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <BigButton label="승인 확인 (새로고침)" busy={busy} tone="plain"
        onPress={async () => { setBusy(true); await reload(); await refreshDocs(); setBusy(false); }} />
      <BigButton label="로그아웃" tone="plain" onPress={signOut} />
    </Screen>
  );
}
