'use server';
import { errorMessage, type OrderStatus } from '@takson/shared';
import { revalidatePath } from 'next/cache';
import { toOrderInsert, type OrderForm } from '@/lib/orders/form';
import { CONFLICT_LABEL, validateOrderEdit } from '@/lib/orders/actions';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

export type Result = { ok: boolean; message: string };
export type Candidate = {
  driver_id: string; name: string | null; phone: string | null;
  distance_km: number | null; active_count: number; conflicts: string[];
};

const LOGIN_NEEDED: Result = { ok: false, message: '로그인이 필요해요.' };

async function staff() {
  return (await getStaffProfile()) ? serverClient() : null;
}

function done(orderId: string, message: string): Result {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  return { ok: true, message };
}

/** 상태·기사 말고 모든 항목 저장 (일반 update. 이력·감사 기록은 서버 트리거가 남긴다) */
export async function saveOrder(orderId: string, form: OrderForm, originalReservedAt: string | null): Promise<Result> {
  const supabase = await staff();
  if (!supabase) return LOGIN_NEEDED;
  const problem = validateOrderEdit(form, originalReservedAt, new Date());
  if (problem) return { ok: false, message: problem };
  const { error } = await supabase.from('orders').update(toOrderInsert(form)).eq('id', orderId);
  if (error) return { ok: false, message: errorMessage(error.message) };
  return done(orderId, '저장했어요.');
}

export async function loadCandidates(orderId: string): Promise<{ ok: true; list: Candidate[] } | { ok: false; message: string }> {
  const supabase = await staff();
  if (!supabase) return LOGIN_NEEDED as { ok: false; message: string };
  const { data, error } = await supabase.rpc('staff_driver_candidates', { p_order_id: orderId });
  if (error) return { ok: false, message: errorMessage(error.message) };
  return { ok: true, list: (data ?? []) as Candidate[] };
}

export async function assignDriver(orderId: string, driverId: string): Promise<Result> {
  const supabase = await staff();
  if (!supabase) return LOGIN_NEEDED;
  const { data, error } = await supabase.rpc('staff_assign', { p_order_id: orderId, p_driver_id: driverId });
  if (error) return { ok: false, message: errorMessage(error.message) };
  const warnings = ((data ?? []) as string[]).map(w => CONFLICT_LABEL[w] ?? w);
  return done(orderId, warnings.length ? `배차했어요. (주의: ${warnings.join(', ')})` : '배차했어요.');
}

export async function unassignOrder(orderId: string, reason: string): Promise<Result> {
  const supabase = await staff();
  if (!supabase) return LOGIN_NEEDED;
  if (!reason.trim()) return { ok: false, message: errorMessage('REASON_REQUIRED') };
  const { error } = await supabase.rpc('staff_unassign', { p_order_id: orderId, p_reason: reason.trim() });
  if (error) return { ok: false, message: errorMessage(error.message) };
  return done(orderId, '기사에게서 회수했어요. 다시 접수 상태예요.');
}

export async function setOrderStatus(orderId: string, status: OrderStatus, reason: string): Promise<Result> {
  const supabase = await staff();
  if (!supabase) return LOGIN_NEEDED;
  const { error } = await supabase.rpc('staff_set_status', {
    p_order_id: orderId, p_status: status, p_reason: reason.trim() || null,
  });
  if (error) return { ok: false, message: errorMessage(error.message) };
  return done(orderId, '상태를 바꿨어요.');
}
