'use client';
import { useState, useTransition } from 'react';
import { setCompanyPaid } from '@/lib/billing/actions';

/** 입금 체크박스: 누르면 바로 저장, 실패하면 원래대로 돌리고 오류 문구 */
export function PaidCheckbox({ company, month, paid, label }: { company: string; month: string; paid: boolean; label: string }) {
  const [on, setOn] = useState(paid);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1">
      <input type="checkbox" checked={on} disabled={pending} aria-label={`${label} 입금 체크`}
        onChange={e => {
          const next = e.target.checked;
          setOn(next);
          setError('');
          start(async () => {
            const r = await setCompanyPaid(company, month, next);
            if (!r?.ok) { setOn(!next); setError(r?.message ?? '저장하지 못했어요.'); }
          });
        }} />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
