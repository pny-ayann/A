'use client';
import type { PaymentMethod } from '@takson/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { saveOrder, type Result } from '@/app/(staff)/orders/[id]/actions';
import { AddressPicker } from '@/components/AddressPicker';
import type { EditForm } from '@/lib/orders/actions';
import { emptyPlace, type Place } from '@/lib/orders/form';

const input = 'rounded border px-2 py-1 text-sm';

/** ISO 시각 → datetime-local 칸 값 (브라우저 시간대) */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 상태·기사 말고 모든 항목 수정 */
export function OrderEditForm({ orderId, initial, updatedAt, companies, capitals, missions }: {
  orderId: string; initial: EditForm; updatedAt: string; companies: { id: string; name: string }[];
  capitals: { id: string; name: string }[];
  /** 지금 쓰는 미션 + 이 오더에 이미 붙은 미션 */
  missions: { id: string; name: string; extra_fare: number }[];
}) {
  const router = useRouter();
  // 화면을 열 때(또는 내가 저장했을 때) 기준. 새로고침으로 바뀐 initial이 아니라 이걸과 비교해야 남의 변경을 덮지 않는다
  const [base, setBase] = useState({ form: initial, updatedAt });
  const [f, setF] = useState(initial);
  const [reserveLocal, setReserveLocal] = useState(toLocalInput(initial.reservedAt));
  const [fareText, setFareText] = useState(initial.fare === null ? '' : String(initial.fare));
  const [sealText, setSealText] = useState(initial.sealCount == null ? '' : String(initial.sealCount));
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  // 저장 결과는 맨 위 고정 줄에도 보여 준다 (위 '저장' 버튼으로 저장해도 보이게)
  const [note, setNote] = useState<HTMLElement | null>(null);
  useEffect(() => setNote(document.getElementById('order-save-note')), []);

  const patch = (p: Partial<EditForm>) => setF(cur => ({ ...cur, ...p }));
  const patchWaypoint = (i: number, p: Partial<Place>) =>
    setF(cur => ({ ...cur, waypoints: cur.waypoints.map((w, j) => (j === i ? { ...w, ...p } : w)) }));
  const patchPlace = (key: 'pickup' | 'dropoff', p: Partial<Place>) => setF(cur => ({ ...cur, [key]: { ...cur[key], ...p } }));
  const latLngs = (x: EditForm) => JSON.stringify([x.pickup, ...x.waypoints, x.dropoff].map(p => [p.lat, p.lng]));
  const moved = latLngs(f) !== latLngs(base.form);
  const missionsChanged = [...f.missionIds].sort().join() !== [...base.form.missionIds].sort().join();

  function submit() {
    // 예약 칸을 안 건드렸으면 원래 값(초 단위까지)을 그대로 보낸다
    const reservedAt = reserveLocal === toLocalInput(base.form.reservedAt)
      ? base.form.reservedAt
      : reserveLocal ? new Date(reserveLocal).toISOString() : null;
    const fare = fareText.trim() === '' ? null : Number(fareText.replaceAll(',', ''));
    // 주소가 바뀌면 예전 거리는 맞지 않으니 비운다
    const sealCount = sealText.trim() === '' ? null : Number(sealText);
    if (sealCount !== null && (!Number.isInteger(sealCount) || sealCount < 1)) {
      setResult({ ok: false, message: '인감 수는 1 이상 숫자로 넣어 주세요.' });
      return;
    }
    const form: EditForm = { ...f, reservedAt, fare, sealCount, distanceKm: moved ? null : f.distanceKm };
    start(async () => {
      const r = await saveOrder(orderId, base.form, form, base.updatedAt);
      setResult(r);
      if (r.ok && r.updatedAt) { setBase({ form, updatedAt: r.updatedAt }); router.refresh(); }
    });
  }

  return (
    <form id="order-edit" onSubmit={e => { e.preventDefault(); if (!pending) submit(); }} className="space-y-3 rounded border bg-white p-3">
      <h2 className="font-semibold">오더 내용 수정</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="업체" value={f.companyId} onChange={e => patch({ companyId: e.target.value })} className={input}>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="종류" value={f.kind} onChange={e => patch({ kind: e.target.value as EditForm['kind'] })} className={input}>
          <option value="takson">탁송</option>
          <option value="docs">서류탁송</option>
          <option value="daeri">대리</option>
        </select>
        {f.kind === 'docs' && (
          <select aria-label="캐피탈 회사" value={f.capitalCompanyId ?? ''}
            onChange={e => patch({ capitalCompanyId: e.target.value || null })} className={input}>
            <option value="">캐피탈 회사를 고르세요</option>
            {capitals.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {f.kind === 'docs' && (
          <label className="flex items-center gap-1">
            인감
            <input aria-label="인감 수" inputMode="numeric" value={sealText} onChange={e => setSealText(e.target.value)} className={`${input} w-14`} />
            장
          </label>
        )}
        <select aria-label="결제 방식" value={f.paymentMethod}
          onChange={e => patch({ paymentMethod: e.target.value as PaymentMethod })} className={input}>
          <option value="postpaid">후불</option>
          <option value="cash">현금</option>
        </select>
        <label className="flex items-center gap-1">
          예약
          <input type="datetime-local" aria-label="예약 시간" value={reserveLocal}
            onChange={e => setReserveLocal(e.target.value)} className={input} />
          {reserveLocal && <button type="button" onClick={() => setReserveLocal('')} className="text-slate-500 underline">지우기</button>}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={f.staffOnly} onChange={e => patch({ staffOnly: e.target.checked })} />
          관제 배차 전용
        </label>
      </div>

      <AddressPicker label="출발지" value={f.pickup} onChange={p => patchPlace('pickup', p)} />
      {f.waypoints.map((w, i) => (
        <AddressPicker key={i} label={`경유지 ${i + 1}`} value={w} onChange={p => patchWaypoint(i, p)}
          onRemove={() => setF(cur => ({ ...cur, waypoints: cur.waypoints.filter((_, j) => j !== i) }))} />
      ))}
      {f.waypoints.length < 5 && (
        <button type="button" onClick={() => setF(cur => ({ ...cur, waypoints: [...cur.waypoints, emptyPlace()] }))}
          className="rounded border px-3 py-1 text-sm hover:bg-slate-50">경유지 추가</button>
      )}
      <AddressPicker label="도착지" value={f.dropoff} onChange={p => patchPlace('dropoff', p)} />

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-36">차량번호 (필수)<input aria-label="차량번호" value={f.vehicleNumber}
          onChange={e => patch({ vehicleNumber: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-36">차종<input aria-label="차종" value={f.vehicleModel}
          onChange={e => patch({ vehicleModel: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-24">색상<input aria-label="색상" value={f.vehicleColor}
          onChange={e => patch({ vehicleColor: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">변속기<select aria-label="변속기" value={f.transmission}
          onChange={e => patch({ transmission: e.target.value as EditForm['transmission'] })} className={`${input} text-sm font-normal text-ink`}>
          <option value="">변속기 모름</option>
          <option value="auto">오토</option>
          <option value="manual">수동</option>
        </select></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-full">기사 메모<textarea aria-label="기사 메모" placeholder="기사에게 남길 말" value={f.driverMemo} rows={2}
          onChange={e => patch({ driverMemo: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
      </div>

      {missions.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="font-semibold">미션</span>
          {missions.map(m => (
            <label key={m.id} className="flex items-center gap-1">
              <input type="checkbox" checked={f.missionIds.includes(m.id)}
                onChange={e => patch({ missionIds: e.target.checked ? [...f.missionIds, m.id] : f.missionIds.filter(x => x !== m.id) })} />
              {m.name} (+{m.extra_fare.toLocaleString('ko-KR')}원)
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm font-semibold">
          요금
          <input aria-label="요금" inputMode="numeric" value={fareText} onChange={e => setFareText(e.target.value)} className={`${input} w-32`} />
          원
        </label>
        {(moved || missionsChanged) && <span className="text-xs text-amber-700">{moved ? '주소' : '미션'}이 바뀌었어요. 요금은 자동으로 안 바뀌니 맞는지 확인해 주세요.</span>}
        <button type="submit" disabled={pending}
          className="ml-auto rounded bg-road px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? '저장 중…' : '저장'}
        </button>
      </div>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
      {note && (pending || result) && createPortal(
        pending ? <span className="text-slate-500">저장 중…</span>
          : <span className={result!.ok ? 'text-green-700' : 'text-red-600'}>{result!.message}</span>,
        note)}
    </form>
  );
}
