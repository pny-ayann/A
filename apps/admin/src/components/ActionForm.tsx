'use client';
import { useActionState, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/admin/guard';
import { Notice } from './Notice';

type Props = {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submit: string;
  className?: string;
  primary?: boolean;
};

/** 서버 액션 폼 + 결과 한 줄 안내. 입력칸은 children으로 받는다. */
export function ActionForm({ action, children, submit, className = 'flex flex-wrap items-center gap-2', primary }: Props) {
  const [result, run, pending] = useActionState<ActionResult, FormData>(action, null);
  const btn = primary
    ? 'rounded bg-road px-3 py-1 text-sm font-semibold text-white disabled:opacity-50'
    : 'rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50';
  return (
    <form action={run} className={className}>
      {children}
      <button disabled={pending} className={btn}>{pending ? '처리 중…' : submit}</button>
      <Notice result={result} />
    </form>
  );
}

export const inputCls = 'rounded border px-2 py-1 text-sm';

/** 계정 발급 공통 입력칸 (아이디·비밀번호·이름·전화) */
export function AccountFields() {
  return (
    <>
      <input name="loginId" placeholder="아이디 (영문 소문자·숫자·_)" aria-label="아이디" required className={`${inputCls} w-52`} />
      <input name="password" type="password" placeholder="비밀번호 8자 이상" aria-label="비밀번호" required minLength={8}
        autoComplete="new-password" className={`${inputCls} w-40`} />
      <input name="name" placeholder="이름" aria-label="이름" required className={`${inputCls} w-28`} />
      <input name="phone" placeholder="전화" aria-label="전화" className={`${inputCls} w-36`} />
    </>
  );
}
