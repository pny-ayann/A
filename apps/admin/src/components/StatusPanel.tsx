'use client';
import type { OrderStatus } from '@takson/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setOrderStatus, type Result } from '@/app/(staff)/orders/[id]/actions';
import { needsReason, type MissingPhotos } from '@/lib/orders/actions';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/orders/labels';

const input = 'rounded border px-2 py-1 text-sm';

/** 상태 바꾸기. 사유가 필요한 경우(취소, 사진 없이 진행) 사유 칸이 필수가 된다 */
export function StatusPanel({ orderId, status, hasDriver, missing }: {
  orderId: string; status: OrderStatus; hasDriver: boolean; missing: MissingPhotos;
}) {
  const router = useRouter();
  const [to, setTo] = useState<OrderStatus | ''>('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  // 기사가 없으면 '배차됨' 이후 상태는 고를 수 없다 (서버도 막는다)
  const choices = STATUS_ORDER.filter(s => s !== status && (hasDriver || s === 'open' || s === 'cancelled'));
  const required = to !== '' && needsReason(status, to, missing);
  const photoNote = to === 'driving' || to === 'completed'
    ? [
        missing.pickup.length ? `출발 사진 ${missing.pickup.length}장` : '',
        to === 'completed' && missing.dropoff.length ? `도착 사진 ${missing.dropoff.length}장` : '',
      ].filter(Boolean).join(', ')
    : '';

  function submit() {
    if (!to) return;
    start(async () => {
      const r = await setOrderStatus(orderId, to, reason);
      setResult(r);
      if (r.ok) { setTo(''); setReason(''); router.refresh(); }
    });
  }

  return (
    <section className="rounded border bg-white p-3">
      <h2 className="mb-2 font-semibold">상태 바꾸기</h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">지금: <b>{STATUS_LABEL[status]}</b> →</span>
        <select aria-label="바꿀 상태" value={to} onChange={e => setTo(e.target.value as OrderStatus | '')} className={input}>
          <option value="">고르세요</option>
          {choices.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input aria-label="상태 변경 사유" value={reason} onChange={e => setReason(e.target.value)}
          placeholder={required ? '사유 (필수)' : '사유 (선택)'}
          className={`${input} min-w-0 flex-1 ${required && !reason.trim() ? 'border-red-400' : ''}`} />
        <button type="button" onClick={submit} disabled={pending || !to || (required && !reason.trim())}
          className="rounded bg-ink px-3 py-1 text-sm text-white disabled:opacity-50">
          {pending ? '처리 중…' : '바꾸기'}
        </button>
      </div>
      {photoNote && <p className="mt-1 text-xs text-red-600">{photoNote}이 없어요. 사유를 남기면 사진 없이 진행할 수 있어요.</p>}
      {to === 'open' && <p className="mt-1 text-xs text-slate-500">접수로 되돌리면 배정된 기사가 빠져요.</p>}
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
    </section>
  );
}
