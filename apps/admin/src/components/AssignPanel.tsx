'use client';
import type { OrderStatus } from '@takson/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { assignDriver, loadCandidates, unassignOrder, type Candidate, type Result } from '@/app/(staff)/orders/[id]/actions';
import { CONFLICT_LABEL } from '@/lib/orders/actions';

const input = 'rounded border px-2 py-1 text-sm';
const btn = 'rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50';

/** 강제 배차(후보 기사 표)와 회수 */
export function AssignPanel({ orderId, status, driverName }: { orderId: string; status: OrderStatus; driverName: string | null }) {
  const router = useRouter();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const canAssign = status === 'open' || status === 'assigned';
  const canUnassign = status === 'assigned' || status === 'arrived_pickup' || status === 'driving';

  const run = (job: () => Promise<Result>) => start(async () => {
    const r = await job();
    setResult(r);
    if (r.ok) { setList(null); setReason(''); router.refresh(); }
  });

  function showCandidates() {
    start(async () => {
      const r = await loadCandidates(orderId);
      if (r.ok) { setList(r.list); setResult(null); } else setResult(r);
    });
  }

  function pick(c: Candidate) {
    const name = c.name ?? '이름 없음';
    if (c.conflicts.length) {
      const why = c.conflicts.map(w => CONFLICT_LABEL[w] ?? w).join(', ');
      if (!window.confirm(`${name} 기사는 ${why}. 그래도 배차할까요?`)) return;
    }
    run(() => assignDriver(orderId, c.driver_id));
  }

  return (
    <section className="rounded border bg-white p-3">
      <h2 className="mb-2 font-semibold">배차</h2>
      <p className="mb-2 text-sm">지금 기사: <b>{driverName ?? '없음'}</b></p>

      {canAssign && (
        <div className="mb-3">
          <button type="button" onClick={showCandidates} disabled={pending} className={btn}>
            {status === 'assigned' ? '다른 기사로 바꾸기' : '기사 골라 배차'}
          </button>
          {list && (
            list.length === 0
              ? <p className="mt-2 text-sm text-slate-500">승인된 기사가 없어요.</p>
              : (
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr><th>이름</th><th>출발지까지</th><th>진행 중</th><th>주의</th><th /></tr>
                  </thead>
                  <tbody>
                    {list.map(c => (
                      <tr key={c.driver_id} className={`border-t ${c.conflicts.length ? 'text-amber-700' : ''}`}>
                        <td className="py-1">{c.name ?? '이름 없음'}</td>
                        <td>{c.distance_km == null ? '위치 모름' : `${c.distance_km.toFixed(1)}km`}</td>
                        <td>{c.active_count}건</td>
                        <td>{c.conflicts.map(w => CONFLICT_LABEL[w] ?? w).join(', ')}</td>
                        <td className="text-right">
                          <button type="button" onClick={() => pick(c)} disabled={pending} className={btn}>배차</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          )}
        </div>
      )}

      {canUnassign && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="회수 사유" placeholder="회수 사유 (필수)" value={reason}
            onChange={e => setReason(e.target.value)} className={`${input} min-w-0 flex-1`} />
          <button type="button" disabled={pending || !reason.trim()} className={btn}
            onClick={() => run(() => unassignOrder(orderId, reason))}>회수</button>
        </div>
      )}

      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
    </section>
  );
}
