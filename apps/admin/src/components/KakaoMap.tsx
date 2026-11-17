'use client';
import { useEffect, useRef, useState } from 'react';

/* 카카오 지도 JS SDK의 필요한 부분만 적은 타입 */
type LatLng = object;
type KakaoMaps = {
  load: (cb: () => void) => void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => { extend: (p: LatLng) => void };
  Map: new (el: HTMLElement, o: { center: LatLng; level: number }) => {
    setBounds: (b: object) => void; setCenter: (p: LatLng) => void; setLevel: (n: number) => void; relayout: () => void;
  };
  CustomOverlay: new (o: { position: LatLng; content: HTMLElement; yAnchor?: number; map?: object }) => { setMap: (m: object | null) => void };
};
declare global { interface Window { kakao?: { maps: KakaoMaps } } }

export type MapMarker = { key: string; lat: number; lng: number; label: string; color: string };

let sdkLoading: Promise<KakaoMaps> | null = null;
function loadSdk(): Promise<KakaoMaps> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) return Promise.reject(new Error('no key'));
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao.maps);
  sdkLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.onload = () => window.kakao ? window.kakao.maps.load(() => resolve(window.kakao!.maps)) : reject(new Error('sdk'));
    s.onerror = () => { sdkLoading = null; reject(new Error('sdk')); };
    document.head.appendChild(s);
  });
  return sdkLoading;
}

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };

/** 표시할 점(출발·도착·기사)을 이름표로 보여 주는 지도. fitKey가 바뀔 때만 화면을 맞춘다 */
export function KakaoMap({ markers, fitKey }: { markers: MapMarker[]; fitKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [maps, setMaps] = useState<KakaoMaps | null>(null);
  const map = useRef<InstanceType<KakaoMaps['Map']> | null>(null);
  const overlays = useRef<{ setMap: (m: object | null) => void }[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSdk().then(m => {
      if (!alive || !box.current) return;
      map.current = new m.Map(box.current, { center: new m.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng), level: 8 });
      setMaps(m);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // 이름표 다시 그리기
  useEffect(() => {
    if (!maps || !map.current) return;
    overlays.current.forEach(o => o.setMap(null));
    overlays.current = markers.map(mk => {
      const el = document.createElement('div');
      el.textContent = mk.label;
      el.style.cssText = `background:${mk.color};color:#fff;font-size:12px;font-weight:600;padding:2px 6px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
      return new maps.CustomOverlay({ position: new maps.LatLng(mk.lat, mk.lng), content: el, yAnchor: 1.2, map: map.current! });
    });
  }, [maps, markers]);

  // 선택이 바뀌면 점들이 다 보이게 맞춘다
  useEffect(() => {
    if (!maps || !map.current || markers.length === 0) return;
    if (markers.length === 1) {
      map.current.setCenter(new maps.LatLng(markers[0]!.lat, markers[0]!.lng));
      map.current.setLevel(5);
      return;
    }
    const b = new maps.LatLngBounds();
    markers.forEach(mk => b.extend(new maps.LatLng(mk.lat, mk.lng)));
    map.current.setBounds(b);
    // fitKey만 바뀔 때 맞추고, 기사 위치가 움직일 때마다 화면이 튀지 않게 markers는 일부러 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, fitKey]);

  return (
    <div className="relative h-full min-h-80 w-full overflow-hidden rounded border bg-slate-100">
      <div ref={box} className="h-full w-full" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-500">
          지도를 불러오지 못했어요. 카카오 개발자 사이트 → 플랫폼 키 → JavaScript 키의 &quot;JavaScript SDK 도메인&quot;에 이 주소가 있는지 확인해 주세요.
        </div>
      )}
    </div>
  );
}
