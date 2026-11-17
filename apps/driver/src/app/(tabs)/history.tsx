import { useAuth } from '@/lib/auth/AuthProvider';
import { BigButton, Body, Screen, Title } from '@/ui/kit';

export default function History() {
  const { profile, signOut } = useAuth();
  return (
    <Screen>
      <Title>운행 내역</Title>
      <Body sub>{profile?.name} 기사님</Body>
      <BigButton label="로그아웃" tone="plain" onPress={signOut} />
    </Screen>
  );
}
