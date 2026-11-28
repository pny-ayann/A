'use server';
import { errorMessage } from '@takson/shared';
import { revalidatePath } from 'next/cache';
import { NOT_ADMIN, requireSettle, type ActionResult } from '@/lib/admin/guard';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';
import { parseOpenings, parseWon } from './parse';

const text = (form: FormData, k: string) => String(form.get(k) ?? '').trim();
const fail = (m: string): ActionResult => ({ ok: false, message: errorMessage(m) });

/** 정산 시작: 기사별 시작 잔액을 넣고 그 순간부터 자동 정산 (관리자, 한 번만) */
export async function startSettlement(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireSettle();
  if (!ctx) return NOT_ADMIN;
  const openings = parseOpenings(form);
  if (typeof openings === 'string') return { ok: false, message: openings };
  const { error } = await ctx.supabase.rpc('start_settlement', { p_openings: openings });
  if (error) return fail(error.message);
  revalidatePath('/admin/wallets');
  return { ok: true, message: '정산을 시작했어요. 지금부터 끝나는 오더가 자동으로 정산돼요.' };
}

/** 충전(+) 또는 조정(+/−, 사유 필수) (관리자) */
export async function walletEntry(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireSettle();
  if (!ctx) return NOT_ADMIN;
  const kind = text(form, 'kind');
  if (kind !== 'topup' && kind !== 'adjust') return { ok: false, message: '종류가 잘못됐어요.' };
  const amount = parseWon(text(form, 'amount'));
  if (amount === null || amount === 0) return { ok: false, message: '금액을 숫자로 넣어 주세요.' };
  const driver = text(form, 'driver');
  const { error } = await ctx.supabase.rpc('admin_wallet_entry', {
    p_driver: driver, p_kind: kind, p_amount: amount, p_reason: text(form, 'reason') || null,
  });
  if (error) return fail(error.message);
  revalidatePath(`/admin/wallets/${driver}`);
  revalidatePath('/admin/wallets');
  return { ok: true, message: kind === 'topup' ? '충전했어요.' : '조정했어요.' };
}

/** 출금 신청 처리: 지급 완료(메모) / 거절(사유 필수) (관리자) */
export async function processWithdrawal(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireSettle();
  if (!ctx) return NOT_ADMIN;
  const result = text(form, 'result');
  const { error } = await ctx.supabase.rpc('process_withdrawal', {
    p_id: text(form, 'id'), p_result: result, p_note: text(form, 'note') || null,
  });
  if (error) return fail(error.message);
  revalidatePath('/admin/withdrawals');
  return { ok: true, message: result === 'paid' ? '지급 완료로 바꿨어요. 기사님께 알림이 갔어요.' : '거절했어요. 금액이 기사님 충전금으로 돌아갔어요.' };
}

/** 주유비 지급: 고른 영수증들 (관제 전체) */
export async function payFuel(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await getStaffProfile())) return { ok: false, message: '관제만 할 수 있어요.' };
  const ids = form.getAll('receipt').map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false, message: '지급할 영수증을 골라 주세요.' };
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc('pay_fuel', { p_receipt_ids: ids });
  if (error) return fail(error.message);
  revalidatePath('/fuel');
  return { ok: true, message: `${data as number}건 지급했어요.` };
}
