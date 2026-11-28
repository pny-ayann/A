import 'server-only';
import { canSettle } from '@/lib/auth/gate';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

export type ActionResult = { ok: boolean; message: string } | null;

/** 서버 액션 첫 줄에서 부른다. 관리자가 아니면 null (RLS도 한 번 더 막는다) */
export async function requireAdmin() {
  const me = await getStaffProfile();
  if (!me || me.staff_level !== 'admin') return null;
  return { me, supabase: await serverClient() };
}

/** 관리자 또는 '정산' 등급 (충전금·출금·업체 정산·업체·기사 관리) */
export async function requireSettle() {
  const me = await getStaffProfile();
  if (!me || !canSettle(me.staff_level)) return null;
  return { me, supabase: await serverClient() };
}

export const NOT_ADMIN: ActionResult = { ok: false, message: '관리자만 할 수 있어요.' };
export const SAVE_FAILED: ActionResult = { ok: false, message: '저장하지 못했어요. 잠시 뒤 다시 해 주세요.' };
