import { supabase } from './supabase';

export type LatLng = { lat: number; lng: number };

/** 주소 → 동네와 좌표 (Supabase 'kakao' 함수를 거침). 실패면 null */
export async function geocode(query: string): Promise<{ area: string; lat: number; lng: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('kakao', { body: { op: 'geocode', query } });
    if (error || !data) return null;
    return data as { area: string; lat: number; lng: number };
  } catch {
    return null;
  }
}

/** 출발 → (경유) → 도착 자동차 거리 km. 실패면 null */
export async function routeKm(points: LatLng[]): Promise<number | null> {
  if (points.length < 2) return null;
  try {
    const { data, error } = await supabase.functions.invoke('kakao', { body: { op: 'route', points } });
    if (error || !data) return null;
    const km = (data as { km: number | null }).km;
    return typeof km === 'number' ? km : null;
  } catch {
    return null;
  }
}
