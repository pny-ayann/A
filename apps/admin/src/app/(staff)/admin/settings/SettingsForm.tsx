'use client';
import { useActionState } from 'react';
import { Notice } from '@/components/Notice';
import type { ActionResult } from '@/lib/admin/guard';
import type { SettingsInput } from '@/lib/admin/validate';
import { saveSettings } from './actions';

const fields: { name: keyof SettingsInput; label: string; help: string }[] = [
  { name: 'release_min_takson', label: '탁송 오더 반납 가능 시간', help: '기사가 탁송 오더를 잡은 뒤 이 시간 안에만 스스로 놓을 수 있어요.' },
  { name: 'release_min_daeri', label: '대리 오더 반납 가능 시간', help: '기사가 대리 오더를 잡은 뒤 이 시간 안에만 스스로 놓을 수 있어요.' },
  { name: 'reservation_gap_min', label: '예약 오더 간격', help: '기사가 가진 예약 시간 앞뒤로 이만큼은 다른 예약을 잡을 수 없어요.' },
  { name: 'unassigned_alert_min', label: '미배차 경고 시간', help: '오더가 이 시간 넘게 배차되지 않으면 관제판에 경고가 떠요.' },
];

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const [result, action, pending] = useActionState<ActionResult, FormData>(saveSettings, null);
  return (
    <form action={action} className="space-y-5">
      {fields.map(f => (
        <label key={f.name} className="block">
          <span className="text-sm font-semibold">{f.label}</span>
          <span className="mt-1 flex items-center gap-2">
            <input name={f.name} type="number" min={1} max={240} step={1} required defaultValue={initial[f.name]}
              className="w-28 rounded border px-2 py-1" />
            <span className="text-sm">분</span>
          </span>
          <span className="mt-1 block text-xs text-slate-500">{f.help}</span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? '저장 중…' : '저장'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  );
}
