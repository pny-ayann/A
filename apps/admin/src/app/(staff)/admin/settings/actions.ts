'use server';
import { revalidatePath } from 'next/cache';
import { NOT_ADMIN, SAVE_FAILED, requireAdmin, type ActionResult } from '@/lib/admin/guard';
import { validateSettings } from '@/lib/admin/validate';

export async function saveSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const num = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v === '' ? Number.NaN : Number(v);
  };
  const s = {
    release_min_takson: num('release_min_takson'),
    release_min_daeri: num('release_min_daeri'),
    reservation_gap_min: num('reservation_gap_min'),
    unassigned_alert_min: num('unassigned_alert_min'),
  };
  const problem = validateSettings(s);
  if (problem) return { ok: false, message: problem };
  const r = await ctx.supabase.from('settings').update(s).eq('id', 1).select('id');
  if (r.error || !r.data?.length) return SAVE_FAILED;
  revalidatePath('/admin/settings');
  return { ok: true, message: '운영 설정을 저장했어요.' };
}
