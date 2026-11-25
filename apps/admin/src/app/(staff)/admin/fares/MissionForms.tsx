'use client';
import { useActionState } from 'react';
import { Notice } from '@/components/Notice';
import type { ActionResult } from '@/lib/admin/guard';
import { addMission, updateMission } from './actions';

type Mission = { id: string; name: string; extra_fare: number; active: boolean };
const input = 'rounded border px-2 py-1 text-sm';

export function MissionRow({ mission }: { mission: Mission }) {
  const [result, action, pending] = useActionState<ActionResult, FormData>(updateMission, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={mission.id} />
      <input name="name" aria-label="미션 이름" defaultValue={mission.name} className={`${input} w-40`} />
      <input name="extra_fare" aria-label="추가요금" inputMode="numeric" defaultValue={mission.extra_fare} className={`${input} w-28`} />
      <span className="text-sm">원</span>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="active" defaultChecked={mission.active} /> 사용
      </label>
      <button disabled={pending} className="rounded border px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50">저장</button>
      <Notice result={result} />
    </form>
  );
}

export function MissionAddForm() {
  const [result, action, pending] = useActionState<ActionResult, FormData>(addMission, null);
  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
      <input name="name" placeholder="새 미션 이름" aria-label="새 미션 이름" className={`${input} w-40`} />
      <input name="extra_fare" placeholder="추가요금" aria-label="새 미션 추가요금" inputMode="numeric" className={`${input} w-28`} />
      <span className="text-sm">원</span>
      <button disabled={pending} className="rounded bg-road px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">미션 추가</button>
      <Notice result={result} />
    </form>
  );
}
