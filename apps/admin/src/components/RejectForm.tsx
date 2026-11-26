'use client';
import { useState } from 'react';
import { REJECT_REASONS } from '@/lib/orders/docs';

const input = 'w-full rounded border px-1 py-0.5 text-xs';

/** 불인정 이유 고르기(기타는 직접 입력) + [불인정] 버튼. 이유가 없으면 버튼이 잠긴다 */
export function RejectForm({ busy, onReject }: { busy: boolean; onReject: (reason: string) => void }) {
  const [pick, setPick] = useState('');
  const [other, setOther] = useState('');
  const reason = pick === '기타' ? other.trim() : pick;
  return (
    <div className="space-y-1">
      <select aria-label="불인정 이유" value={pick} onChange={e => setPick(e.target.value)} className={input}>
        <option value="">불인정 이유</option>
        {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        <option value="기타">기타(직접 입력)</option>
      </select>
      {pick === '기타' && (
        <input aria-label="불인정 이유 직접 입력" value={other} onChange={e => setOther(e.target.value)} className={input} />
      )}
      <button type="button" disabled={busy || !reason} onClick={() => onReject(reason)}
        className="w-full rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40">
        불인정
      </button>
    </div>
  );
}
