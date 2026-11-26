'use client';
import type { PaymentMethod } from '@takson/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveOrder, type Result } from '@/app/(staff)/orders/[id]/actions';
import { AddressPicker } from '@/components/AddressPicker';
import type { OrderForm, Place } from '@/lib/orders/form';

const input = 'rounded border px-2 py-1 text-sm';

/** ISO 시각 → datetime-local 칸 값 (브라우저 시간대) */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 상태·기사 말고 모든 항목 수정 */
export function OrderEditForm({ orderId, initial, updatedAt, companies, capitals }: {
  orderId: string; initial: OrderForm; updatedAt: string; companies: { id: string; name: string }[];
  capitals: { id: string; name: string }[];
}) {
  const router = useRouter();
  // 화면을 열 때(또는 내가 저장했을 때) 기준. 새로고침으로 바뀐 initial이 아니라 이걸과 비교해야 남의 변경을 덮지 않는다
  const [base, setBase] = useState({ form: initial, updatedAt });
  const [f, setF] = useState(initial);
  const [reserveLocal, setReserveLocal] = useState(toLocalInput(initial.reservedAt));
  const [fareText, setFareText] = useState(initial.fare === null ? '' : String(initial.fare));
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const patch = (p: Partial<OrderForm>) => setF(cur => ({ ...cur, ...p }));
  const patchPlace = (key: 'pickup' | 'dropoff', p: Partial<Place>) => setF(cur => ({ ...cur, [key]: { ...cur[key], ...p } }));
  const moved = (['pickup', 'dropoff'] as const).some(k => f[k].lat !== base.form[k].lat || f[k].lng !== base.form[k].lng);

  function submit() {
    // 예약 칸을 안 건드렸으면 원래 값(초 단위까지)을 그대로 보낸다
    const reservedAt = reserveLocal === toLocalInput(base.form.reservedAt)
      ? base.form.reservedAt
      : reserveLocal ? new Date(reserveLocal).toISOString() : null;
    const fare = fareText.trim() === '' ? null : Number(fareText.replaceAll(',', ''));
    // 주소가 바뀌면 예전 거리는 맞지 않으니 비운다
    const form: OrderForm = { ...f, reservedAt, fare, distanceKm: moved ? null : f.distanceKm };
    start(async () => {
      const r = await saveOrder(orderId, base.form, form, base.updatedAt);
      setResult(r);
      if (r.ok && r.updatedAt) { setBase({ form, updatedAt: r.updatedAt }); router.refresh(); }
    });
  }

  return (
    <section className="space-y-3 rounded border bg-white p-3">
      <h2 className="font-semibold">오더 내용 수정</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="업체" value={f.companyId} onChange={e => patch({ companyId: e.target.value })} className={input}>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="종류" value={f.kind} onChange={e => patch({ kind: e.target.value as OrderForm['kind'] })} className={input}>
          <option value="takson">일반탁송</option>
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
      <AddressPicker label="도착지" value={f.dropoff} onChange={p => patchPlace('dropoff', p)} />

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-36">차량번호 (필수)<input aria-label="차량번호" value={f.vehicleNumber}
          onChange={e => patch({ vehicleNumber: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-36">차종<input aria-label="차종" value={f.vehicleModel}
          onChange={e => patch({ vehicleModel: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-24">색상<input aria-label="색상" value={f.vehicleColor}
          onChange={e => patch({ vehicleColor: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600">변속기<select aria-label="변속기" value={f.transmission}
          onChange={e => patch({ transmission: e.target.value as OrderForm['transmission'] })} className={`${input} text-sm font-normal text-ink`}>
          <option value="">변속기 모름</option>
          <option value="auto">오토</option>
          <option value="manual">수동</option>
        </select></label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-600 w-full">기사 메모<textarea aria-label="기사 메모" placeholder="기사에게 남길 말" value={f.driverMemo} rows={2}
          onChange={e => patch({ driverMemo: e.target.value })} className={`${input} w-full text-sm font-normal text-ink`} /></label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm font-semibold">
          요금
          <input aria-label="요금" inputMode="numeric" value={fareText} onChange={e => setFareText(e.target.value)} className={`${input} w-32`} />
          원
        </label>
        {moved && <span className="text-xs text-amber-700">주소가 바뀌었어요. 요금이 맞는지 확인해 주세요.</span>}
        <button type="button" onClick={submit} disabled={pending}
          className="ml-auto rounded bg-road px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? '저장 중…' : '저장'}
        </button>
      </div>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
    </section>
  );
}
