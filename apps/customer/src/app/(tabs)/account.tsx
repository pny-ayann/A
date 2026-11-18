import { useAuth } from '@/lib/auth/AuthProvider';
import { BigButton, Body, Card, Screen, Title } from '@/ui/kit';

/** 내 정보: 업체 이름, 내 이름, 로그아웃 */
export default function Account() {
  const { profile, companyName, signOut } = useAuth();
  return (
    <Screen>
      <Title>내 정보</Title>
      <Card>
        <Body>업체: {companyName ?? '-'}</Body>
        <Body>이름: {profile?.name ?? '-'}</Body>
      </Card>
      <BigButton label="로그아웃" tone="plain" onPress={() => void signOut()} />
    </Screen>
  );
}
