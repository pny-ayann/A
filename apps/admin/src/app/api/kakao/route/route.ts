import { NextResponse } from 'next/server';
import { routeKm, type LatLng } from '@/lib/kakao/server';
import { getStaffProfile } from '@/lib/supabase/server';

const isPoint = (p: unknown): p is LatLng =>
  typeof p === 'object' && p !== null
  && Number.isFinite((p as LatLng).lat) && Number.isFinite((p as LatLng).lng);

// middleware는 /api 를 거르지 않으므로 여기서 직원인지 직접 확인한다
export async function POST(req: Request) {
  if (!(await getStaffProfile())) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  const points = (body as { points?: unknown })?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 7 || !points.every(isPoint)) {
    return NextResponse.json({ error: '좌표가 잘못됐어요.' }, { status: 400 });
  }
  try {
    const km = await routeKm(points);
    return km === null
      ? NextResponse.json({ error: '거리를 못 구했어요.' }, { status: 404 })
      : NextResponse.json({ km });
  } catch {
    return NextResponse.json({ error: '거리를 못 구했어요.' }, { status: 502 });
  }
}
