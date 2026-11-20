'use server';
import { errorMessage } from '@takson/shared';
import { revalidatePath } from 'next/cache';
import { NOT_ADMIN, requireAdmin, type ActionResult } from '@/lib/admin/guard';
import { monthStart } from './month';

/** 업체·달 입금 체크 / 해제 (관리자). 체크하면 그때 청구금액이 함께 저장된다. */
export async function setCompanyPaid(company: string, month: string, paid: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, message: '달이 잘못됐어요.' };
  const { error } = await ctx.supabase.rpc('set_company_paid', { p_company: company, p_month: monthStart(month), p_paid: paid });
  if (error) return { ok: false, message: errorMessage(error.message) };
  revalidatePath('/admin/billing', 'layout');
  return { ok: true, message: paid ? '입금 완료로 체크했어요.' : '체크를 풀었어요.' };
}
