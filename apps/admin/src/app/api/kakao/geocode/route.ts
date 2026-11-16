import { NextResponse } from 'next/server';
import { geocode } from '@/lib/kakao/server';
import { getStaffProfile } from '@/lib/supabase/server';

// middleware는 /api 를 거르지 않으므로 여기서 직원인지 직접 확인한다
export async function GET(req: Request) {
  if (!(await getStaffProfile())) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: '주소를 넣어 주세요.' }, { status: 400 });
  try {
    const r = await geocode(q.slice(0, 200));
    return r ? NextResponse.json(r) : NextResponse.json({ error: '주소를 찾지 못했어요.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: '주소 검색이 잠시 안 돼요.' }, { status: 502 });
  }
}
