'use server';
import { revalidatePath } from 'next/cache';
import { toOrderInsert, toWaypointRows, validateOrderForm, type OrderForm, type Place } from '@/lib/orders/form';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';
import { errorMessage } from '@takson/shared';

export type CreateOrderResult = { ok: true; orderId: string; message: string } | { ok: false; message: string };

/** 업체의 자주 쓰는 주소 10개 */
export async function loadTopAddresses(companyId: string): Promise<Place[]> {
  if (!(await getStaffProfile()) || !companyId) return [];
  const supabase = await serverClient();
  const { data } = await supabase.rpc('top_addresses', { p_company_id: companyId });
  return ((data ?? []) as Record<string, unknown>[]).map(a => ({
    address: String(a.address ?? ''),
    detail: String(a.detail ?? ''),
    area: (a.area as string | null) ?? null,
    lat: (a.lat as number | null) ?? null,
    lng: (a.lng as number | null) ?? null,
    contactName: String(a.contact_name ?? ''),
    contactPhone: String(a.contact_phone ?? ''),
  }));
}

export async function createOrder(form: OrderForm): Promise<CreateOrderResult> {
  if (!(await getStaffProfile())) return { ok: false, message: '로그인이 필요해요.' };
  const problem = validateOrderForm(form, new Date());
  if (problem) return { ok: false, message: problem };
  const supabase = await serverClient();

  // 오더·경유지·미션을 서버에서 한 번에 저장 (중간에 실패하면 아무것도 남지 않음, 미션 요금은 서버 값)
  const { data, error } = await supabase.rpc('create_order', {
    p_order: toOrderInsert(form),
    p_waypoints: toWaypointRows('', form.waypoints),
    p_mission_ids: form.missionIds,
  });
  if (error || !data) return { ok: false, message: errorMessage(error?.message ?? '') };
  revalidatePath('/orders');
  return { ok: true, orderId: data as string, message: '오더를 접수했어요.' };
}
