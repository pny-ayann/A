'use server';
import { revalidatePath } from 'next/cache';
import { toOrderInsert, toWaypointRows, validateOrderForm, type OrderForm, type Place } from '@/lib/orders/form';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

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

  // 미션 추가요금은 화면 값이 아니라 지금 서버에 있는 값으로 기록한다
  let missions: { id: string; extra_fare: number }[] = [];
  if (form.missionIds.length) {
    const m = await supabase.from('missions').select('id, extra_fare').in('id', form.missionIds).eq('active', true);
    if (m.error) return { ok: false, message: '미션 정보를 불러오지 못했어요.' };
    if (m.data.length !== new Set(form.missionIds).size) return { ok: false, message: '꺼진 미션이 있어요. 다시 골라 주세요.' };
    missions = m.data;
  }

  const ins = await supabase.from('orders').insert(toOrderInsert(form)).select('id').single();
  if (ins.error || !ins.data) return { ok: false, message: '오더를 접수하지 못했어요. 잠시 뒤 다시 해 주세요.' };
  const orderId = ins.data.id as string;

  const problems: string[] = [];
  if (form.waypoints.length) {
    const w = await supabase.from('order_waypoints').insert(toWaypointRows(orderId, form.waypoints));
    if (w.error) problems.push('경유지');
  }
  if (missions.length) {
    const r = await supabase.from('order_missions')
      .insert(missions.map(m => ({ order_id: orderId, mission_id: m.id, extra_fare: m.extra_fare })));
    if (r.error) problems.push('미션');
  }
  revalidatePath('/orders');
  if (problems.length) {
    return { ok: true, orderId, message: `오더는 접수됐지만 ${problems.join('·')} 저장에 실패했어요. 오더 상세에서 확인해 주세요.` };
  }
  return { ok: true, orderId, message: '오더를 접수했어요.' };
}
