'use client';
import { calcFare, type FareBand, type PaymentMethod } from '@takson/shared';
import { useEffect, useState, useTransition } from 'react';
import { AddressPicker } from '@/components/AddressPicker';
import { emptyPlace, validateOrderForm, type OrderForm, type Place } from '@/lib/orders/form';
import { createOrder, loadTopAddresses } from './actions';

type Company = { id: string; name: string; default_payment: string };
type Mission = { id: string; name: string; extra_fare: number };

const input = 'rounded border px-2 py-1 text-sm';
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function blankForm(company?: Company): OrderForm {
  return {
    companyId: company?.id ?? '', kind: 'takson', pickup: emptyPlace(), dropoff: emptyPlace(), waypoints: [],
    vehicleNumber: '', vehicleModel: '', vehicleColor: '', transmission: '', driverMemo: '', missionIds: [],
    reservedAt: null, paymentMethod: (company?.default_payment as PaymentMethod) ?? 'postpaid',
    fare: null, distanceKm: null, staffOnly: false,
  };
}

type Distance = { state: 'idle' | 'loading' | 'failed' } | { state: 'ok'; km: number };

export function OrderNewForm({ companies, bands, missions }: { companies: Company[]; bands: FareBand[]; missions: Mission[] }) {
  const [f, setF] = useState<OrderForm>(() => blankForm());
  const [top, setTop] = useState<Place[]>([]);
  const [distance, setDistance] = useState<Distance>({ state: 'idle' });
  const [fareText, setFareText] = useState<string | null>(null); // null이면 자동 요금
  const [reserveLocal, setReserveLocal] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  const patch = (p: Partial<OrderForm>) => setF(cur => ({ ...cur, ...p }));
  const patchPlace = (key: 'pickup' | 'dropoff', p: Partial<Place>) => setF(cur => ({ ...cur, [key]: { ...cur[key], ...p } }));
  const patchWaypoint = (i: number, p: Partial<Place>) =>
    setF(cur => ({ ...cur, waypoints: cur.waypoints.map((w, j) => (j === i ? { ...w, ...p } : w)) }));

  // 업체가 바뀌면 자주 쓰는 주소와 기본 결제 방식을 불러온다
  useEffect(() => {
    if (!f.companyId) { setTop([]); return; }
    let alive = true;
    void loadTopAddresses(f.companyId).then(list => { if (alive) setTop(list); });
    return () => { alive = false; };
  }, [f.companyId]);

  // 모든 지점의 좌표가 있으면 거리를 계산한다
  const points = [f.pickup, ...f.waypoints, f.dropoff];
  const pointsKey = points.every(p => p.lat !== null && p.lng !== null)
    ? JSON.stringify(points.map(p => [p.lat, p.lng]))
    : '';
  useEffect(() => {
    if (!pointsKey) { setDistance({ state: 'idle' }); return; }
    let alive = true;
    setDistance({ state: 'loading' });
    const body = { points: (JSON.parse(pointsKey) as [number, number][]).map(([lat, lng]) => ({ lat, lng })) };
    fetch('/api/kakao/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async res => {
        const json = await res.json();
        if (!alive) return;
        setDistance(res.ok && typeof json.km === 'number' ? { state: 'ok', km: json.km } : { state: 'failed' });
      })
      .catch(() => { if (alive) setDistance({ state: 'failed' }); });
    return () => { alive = false; };
  }, [pointsKey]);

  const extras = missions.filter(m => f.missionIds.includes(m.id)).map(m => m.extra_fare);
  const autoFare = distance.state === 'ok' && bands.length ? calcFare(distance.km, bands, extras) : null;
  const fareValue = fareText === null ? autoFare : fareText.trim() === '' ? null : Number(fareText.replaceAll(',', ''));
  const distanceKm = distance.state === 'ok' ? distance.km : null;

  function pickCompany(id: string) {
    const c = companies.find(x => x.id === id);
    setF(cur => ({ ...cur, companyId: id, paymentMethod: (c?.default_payment as PaymentMethod) ?? cur.paymentMethod }));
  }

  function fillFromTop(p: Place, key: 'pickup' | 'dropoff') {
    patchPlace(key, { ...p });
  }

  function submit() {
    const reservedAt = reserveLocal ? new Date(reserveLocal).toISOString() : null;
    const form: OrderForm = { ...f, reservedAt, fare: fareValue, distanceKm };
    const problem = validateOrderForm(form, new Date());
    if (problem) { setResult({ ok: false, message: problem }); return; }
    start(async () => {
      const r = await createOrder(form);
      setResult(r);
      if (r.ok) {
        const c = companies.find(x => x.id === f.companyId);
        setF(blankForm(c));
        setFareText(null);
        setReserveLocal('');
        if (c) void loadTopAddresses(c.id).then(setTop);
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-3">
        <select aria-label="업체" value={f.companyId} onChange={e => pickCompany(e.target.value)} className={`${input} w-56`}>
          <option value="">업체를 고르세요</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-1 text-sm">
          {(['takson', 'daeri'] as const).map(k => (
            <button key={k} type="button" onClick={() => patch({ kind: k })}
              className={`rounded border px-3 py-1 ${f.kind === k ? 'bg-ink text-white' : 'hover:bg-slate-50'}`}>
              {k === 'takson' ? '탁송' : '대리'}
            </button>
          ))}
        </div>
      </section>

      {top.length > 0 && (
        <section>
          <div className="mb-1 text-sm font-semibold">자주 쓰는 주소</div>
          <div className="flex flex-wrap gap-2">
            {top.map(p => (
              <span key={`${p.address}|${p.detail}`} className="flex items-center gap-1 rounded-full border bg-white px-3 py-1 text-xs">
                <span title={p.address}>{p.area ?? p.address}{p.detail ? ` · ${p.detail}` : ''}</span>
                <button type="button" onClick={() => fillFromTop(p, 'pickup')} className="text-road hover:underline">출발</button>
                <button type="button" onClick={() => fillFromTop(p, 'dropoff')} className="text-road hover:underline">도착</button>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
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
      </section>

      <section className="flex flex-wrap gap-2">
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
      </section>

      {missions.length > 0 && (
        <section className="flex flex-wrap gap-3 text-sm">
          <span className="font-semibold">미션</span>
          {missions.map(m => (
            <label key={m.id} className="flex items-center gap-1">
              <input type="checkbox" checked={f.missionIds.includes(m.id)}
                onChange={e => patch({ missionIds: e.target.checked ? [...f.missionIds, m.id] : f.missionIds.filter(x => x !== m.id) })} />
              {m.name} (+{won(m.extra_fare)})
            </label>
          ))}
        </section>
      )}

      <section className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          예약
          <input type="datetime-local" aria-label="예약 시간" value={reserveLocal}
            onChange={e => setReserveLocal(e.target.value)} className={input} />
          {reserveLocal && <button type="button" onClick={() => setReserveLocal('')} className="text-slate-500 underline">지우기</button>}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={f.staffOnly} onChange={e => patch({ staffOnly: e.target.checked })} />
          관제 배차 전용 (기사 목록에 안 보임)
        </label>
        <select aria-label="결제 방식" value={f.paymentMethod}
          onChange={e => patch({ paymentMethod: e.target.value as PaymentMethod })} className={input}>
          <option value="postpaid">후불</option>
          <option value="cash">현금</option>
        </select>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded border bg-white p-3">
        <span className="text-sm">
          거리:{' '}
          {distance.state === 'ok' ? `${distance.km}km`
            : distance.state === 'loading' ? '계산 중…'
            : distance.state === 'failed' ? '거리를 못 구했어요. 요금을 직접 입력해 주세요.'
            : points.every(p => p.address.trim())
              ? '주소 위치를 확인하는 중이거나 못 찾았어요. 못 찾았으면 요금을 직접 입력해 주세요.'
              : '출발지·도착지를 넣으면 계산돼요.'}
        </span>
        <label className="flex items-center gap-1 text-sm font-semibold">
          요금
          <input aria-label="요금" inputMode="numeric" value={fareText ?? (autoFare === null ? '' : String(autoFare))}
            onChange={e => setFareText(e.target.value)} className={`${input} w-32`} />
          원
        </label>
        {fareText !== null && autoFare !== null && (
          <button type="button" onClick={() => setFareText(null)} className="text-xs text-slate-500 underline">
            자동 요금({won(autoFare)})으로
          </button>
        )}
        <button type="button" onClick={submit} disabled={pending}
          className="ml-auto rounded bg-road px-5 py-2 font-semibold text-white disabled:opacity-50">
          {pending ? '접수 중…' : '접수'}
        </button>
      </section>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
