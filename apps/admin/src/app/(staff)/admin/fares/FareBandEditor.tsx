'use client';
import { useState, useTransition } from 'react';
import { Notice } from '@/components/Notice';
import type { ActionResult } from '@/lib/admin/guard';
import { validateFareBands, type FareBandInput } from '@/lib/admin/validate';
import { saveFareBands } from './actions';

type Row = { key: number; max_km: string; fare: string };
let nextKey = 0;
const toRow = (b: FareBandInput): Row => ({ key: nextKey++, max_km: String(b.max_km), fare: String(b.fare) });
const toNum = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replaceAll(',', '')));

export function FareBandEditor({ initial }: { initial: FareBandInput[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map(toRow));
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();

  const set = (key: number, field: 'max_km' | 'fare', value: string) =>
    setRows(rs => rs.map(r => (r.key === key ? { ...r, [field]: value } : r)));

  function save() {
    const data = rows.map(r => ({ max_km: toNum(r.max_km), fare: toNum(r.fare) }));
    const problem = validateFareBands(data);
    if (problem) return setResult({ ok: false, message: problem });
    start(async () => {
      const r = await saveFareBands(data);
      setResult(r);
      if (r?.ok) setRows([...data].sort((a, b) => a.max_km - b.max_km).map(toRow));
    });
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-600">
            <th className="py-2">최대 거리 (km)</th><th>요금 (원)</th><th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="border-b">
              <td className="py-1.5 pr-3">
                <input aria-label="최대 거리" inputMode="decimal" value={r.max_km}
                  onChange={e => set(r.key, 'max_km', e.target.value)} className="w-full rounded border px-2 py-1" />
              </td>
              <td className="pr-3">
                <input aria-label="요금" inputMode="numeric" value={r.fare}
                  onChange={e => set(r.key, 'fare', e.target.value)} className="w-full rounded border px-2 py-1" />
              </td>
              <td>
                <button type="button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                  className="text-red-600 hover:underline">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setRows(rs => [...rs, { key: nextKey++, max_km: '', fare: '' }])}
          className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">구간 추가</button>
        <button type="button" onClick={save} disabled={pending}
          className="rounded bg-road px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? '저장 중…' : '요금표 저장'}
        </button>
        <Notice result={result} />
      </div>
    </div>
  );
}
