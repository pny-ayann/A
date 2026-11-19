import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { BigButton, Notice, Screen, Title } from '@/ui/kit';

/** 로그인은 돼 있는데 내 정보를 못 불러왔을 때 (신호 약함·서버 오류) */
export default function Retry() {
  const { retry, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Title>연결이 안 돼요</Title>
      <Notice tone="danger">내 정보를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</Notice>
      <BigButton label="다시 시도" busy={busy} onPress={async () => { setBusy(true); await retry(); setBusy(false); }} />
      <BigButton label="로그아웃" tone="plain" onPress={() => void signOut()} />
    </Screen>
  );
}
