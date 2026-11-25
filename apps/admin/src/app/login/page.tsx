import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-[360px] rounded-xl bg-white p-8 shadow">
        <h1 className="mb-3 text-xl"><span className="plate">탁송 관제</span></h1>
        <p className="mb-6 text-sm text-gray-500">직원 아이디로 로그인하세요.</p>
        <LoginForm initialMessage={m === 'notstaff' ? '직원 계정이 아니에요.' : null} />
      </div>
    </main>
  );
}
