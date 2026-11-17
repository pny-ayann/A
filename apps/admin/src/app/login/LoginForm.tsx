'use client';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm({ initialMessage }: { initialMessage: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, initialMessage ? { message: initialMessage } : null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        아이디
        <input name="loginId" autoComplete="username" required
          className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="block text-sm">
        비밀번호
        <input name="password" type="password" autoComplete="current-password" required
          className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      {state?.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
      <button disabled={pending} className="w-full rounded bg-blue-600 py-2 font-semibold text-white disabled:opacity-50">
        {pending ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
