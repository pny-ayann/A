'use server';
import { revalidatePath } from 'next/cache';
import { NOT_ADMIN, SAVE_FAILED, requireAdmin, type ActionResult } from '@/lib/admin/guard';
import { validateFareBands, validateMission, type FareBandInput } from '@/lib/admin/validate';

/** 요금표 전체 교체: 새 목록을 거리 기준으로 넣고(upsert), 목록에 없는 구간은 지운다 */
export async function saveFareBands(rows: FareBandInput[]): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const clean = rows.map(r => ({ max_km: Number(r.max_km), fare: Number(r.fare) }));
  const problem = validateFareBands(clean);
  if (problem) return { ok: false, message: problem };

  const up = await ctx.supabase.from('fare_bands').upsert(clean, { onConflict: 'max_km' });
  if (up.error) return SAVE_FAILED;
  const keep = clean.map(r => r.max_km).join(',');
  const del = await ctx.supabase.from('fare_bands').delete().not('max_km', 'in', `(${keep})`);
  if (del.error) return SAVE_FAILED;
  revalidatePath('/admin/fares');
  return { ok: true, message: '요금표를 저장했어요.' };
}

function readMission(form: FormData) {
  const fare = String(form.get('extra_fare') ?? '').replaceAll(',', '').trim();
  return {
    name: String(form.get('name') ?? '').trim(),
    extra_fare: fare === '' ? Number.NaN : Number(fare),
    active: form.get('active') === 'on',
  };
}

export async function addMission(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const m = readMission(form);
  const problem = validateMission(m);
  if (problem) return { ok: false, message: problem };
  const r = await ctx.supabase.from('missions').insert({ name: m.name, extra_fare: m.extra_fare, active: true });
  if (r.error) return SAVE_FAILED;
  revalidatePath('/admin/fares');
  return { ok: true, message: `'${m.name}' 미션을 추가했어요.` };
}

export async function updateMission(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const id = String(form.get('id') ?? '');
  const m = readMission(form);
  const problem = validateMission(m);
  if (problem) return { ok: false, message: problem };
  const r = await ctx.supabase.from('missions').update(m).eq('id', id).select('id');
  if (r.error || !r.data?.length) return SAVE_FAILED;
  revalidatePath('/admin/fares');
  return { ok: true, message: '저장했어요.' };
}
