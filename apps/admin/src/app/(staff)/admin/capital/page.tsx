import { notFound } from 'next/navigation';
import { getStaffProfile } from '@/lib/supabase/server';
import { CapitalManager } from './CapitalManager';

/** 관리자: 캐피탈 회사와 회사별 작성 예시 양식 (기사 앱 '서류 예시'에 보임) */
export default async function CapitalPage() {
  if ((await getStaffProfile())?.staff_level !== 'admin') notFound();
  return (
    <div className="max-w-5xl space-y-3">
      <h1 className="text-xl font-bold">캐피탈 회사·서류 예시</h1>
      <p className="text-sm text-slate-500">
        서류탁송 오더를 만들 때 고르는 회사와, 기사님이 보는 작성 예시 사진이에요.
        표지로 표시한 사진은 기사님께 보이기만 하고 서류 사진 칸은 만들지 않아요.
        실제 고객 정보가 들어간 사진은 올리지 마세요.
      </p>
      <CapitalManager />
    </div>
  );
}
