import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { BigButton, Body, Screen, Title } from '@/ui/kit';

export default function Pending() {
  const { route, profile, reload, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const suspended = route === 'suspended';
  return (
    <Screen>
      <Title>{suspended ? '이용이 정지됐어요' : '승인을 기다리고 있어요'}</Title>
      <Body>{profile?.name ? `${profile.name} 기사님, ` : ''}{suspended
        ? '관제에 문의해 주세요.'
        : '관제가 서류를 확인하고 승인하면 오더를 받을 수 있어요.'}</Body>
      <BigButton label="새로고침" busy={busy} onPress={async () => { setBusy(true); await reload(); setBusy(false); }} />
      <BigButton label="로그아웃" tone="plain" onPress={signOut} />
    </Screen>
  );
}
