'use client';
import { useRef, useState } from 'react';
import type { Place } from '@/lib/orders/form';

type DaumPostcodeData = { roadAddress: string; jibunAddress: string; address: string };
declare global {
  interface Window {
    daum?: { Postcode: new (o: { oncomplete: (d: DaumPostcodeData) => void }) => { open: () => void } };
  }
}

const POSTCODE_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
let postcodeLoading: Promise<void> | null = null;
function loadPostcode(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  postcodeLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = POSTCODE_SRC;
    s.onload = () => resolve();
    s.onerror = () => { postcodeLoading = null; reject(new Error('postcode')); };
    document.head.appendChild(s);
  });
  return postcodeLoading;
}

const input = 'rounded border px-2 py-1 text-sm font-normal';
const fieldCls = 'flex flex-col gap-0.5 text-xs font-medium text-slate-600';

/** 주소 한 칸: 검색(우편번호 팝업) → 좌표·동네 자동, 상세주소, 연락처 */
export function AddressPicker({ label, value, onChange, onRemove }: {
  label: string;
  value: Place;
  onChange: (patch: Partial<Place>) => void;
  onRemove?: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef(0); // 마지막으로 요청한 주소의 결과만 반영한다

  async function setAddress(address: string) {
    const ticket = ++latest.current;
    onChange({ address, area: null, lat: null, lng: null });
    if (!address.trim()) return;
    setNote('위치를 찾는 중…');
    try {
      const res = await fetch(`/api/kakao/geocode?q=${encodeURIComponent(address)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      if (ticket !== latest.current) return;
      onChange({ area: body.area, lat: body.lat, lng: body.lng });
      setNote(null);
    } catch {
      if (ticket === latest.current) setNote('위치를 못 찾았어요. 주소는 그대로 접수돼요. 요금은 직접 확인해 주세요.');
    }
  }

  async function search() {
    try {
      await loadPostcode();
      new window.daum!.Postcode({ oncomplete: d => void setAddress(d.roadAddress || d.address) }).open();
    } catch {
      setNote('주소 검색 창을 열지 못했어요. 주소를 직접 입력해 주세요.');
    }
  }

  return (
    <fieldset className="rounded border p-3">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${fieldCls} min-w-0 flex-1`}>주소<input aria-label={`${label} 주소`} value={value.address}
          onChange={e => { latest.current++; setNote(null); onChange({ address: e.target.value, area: null, lat: null, lng: null }); }}
          onBlur={e => { if (e.target.value.trim() && value.lat === null) void setAddress(e.target.value); }}
          className={`${input} w-full text-ink`} /></label>
        <button type="button" onClick={search} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">주소 검색</button>
        {onRemove && <button type="button" onClick={onRemove} className="text-sm text-red-600 hover:underline">빼기</button>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className={`${fieldCls} min-w-0 flex-1`}>상세주소<input aria-label={`${label} 상세주소`} value={value.detail} placeholder="동·호수, 주차 위치"
          onChange={e => onChange({ detail: e.target.value })} className={`${input} w-full text-ink`} /></label>
        <label className={`${fieldCls} w-28`}>담당자<input aria-label={`${label} 담당자`} value={value.contactName}
          onChange={e => onChange({ contactName: e.target.value })} className={`${input} w-full text-ink`} /></label>
        <label className={`${fieldCls} w-36`}>연락처<input aria-label={`${label} 연락처`} value={value.contactPhone}
          onChange={e => onChange({ contactPhone: e.target.value })} className={`${input} w-full text-ink`} /></label>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {value.address ? (note ?? (value.area ? `동네: ${value.area}` : '위치 확인 전')) : ''}
      </div>
    </fieldset>
  );
}
