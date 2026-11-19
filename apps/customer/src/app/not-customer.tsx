import { useAuth } from '@/lib/auth/AuthProvider';
import { BigButton, Notice, Screen, Title } from '@/ui/kit';

/** 기사·관제 계정이나 업체가 없는 계정으로 로그인했을 때 */
export default function NotCustomer() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <Title>고객 계정이 아니에요</Title>
      <Notice tone="danger">이 앱은 업체(고객) 계정으로만 쓸 수 있어요. 기사님은 기사 앱을, 관제는 관제 웹을 써 주세요.</Notice>
      <BigButton label="로그아웃" onPress={() => void signOut()} />
    </Screen>
  );
}
