'use server';
import { revalidatePath } from 'next/cache';
import { NOT_ADMIN, SAVE_FAILED, requireAdmin, type ActionResult } from '@/lib/admin/guard';
import { adminClient } from '@/lib/supabase/admin';
import { createAccount, type NewAccount } from './create';

const text = (form: FormData, k: string) => String(form.get(k) ?? '').trim();

/** 계정 발급 (업체 직원·기사·관제 직원 공통). 관리자 확인 뒤에만 서비스 키를 쓴다. */
export async function issueAccount(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const common = {
    loginId: text(form, 'loginId'),
    password: String(form.get('password') ?? ''),
    name: text(form, 'name'),
    phone: text(form, 'phone'),
  };
  if (!common.name) return { ok: false, message: '이름을 넣어 주세요.' };
  const role = text(form, 'role');
  let account: NewAccount;
  if (role === 'customer') {
    const companyId = text(form, 'companyId');
    if (!companyId) return { ok: false, message: '업체를 골라 주세요.' };
    account = { ...common, role, companyId };
  } else if (role === 'driver') {
    account = { ...common, role };
  } else if (role === 'staff') {
    const level = text(form, 'staffLevel');
    if (level !== 'admin' && level !== 'operator') return { ok: false, message: '등급을 골라 주세요.' };
    account = { ...common, role, staffLevel: level };
  } else {
    return { ok: false, message: '계정 종류가 잘못됐어요.' };
  }

  const r = await createAccount(adminClient(), account);
  if (!r.ok) return r;
  revalidatePath('/admin', 'layout');
  return { ok: true, message: `'${account.loginId.trim().toLowerCase()}' 계정을 만들었어요.` };
}

export async function saveCompany(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const id = text(form, 'id');
  const row = {
    name: text(form, 'name'),
    phone: text(form, 'phone') || null,
    default_payment: text(form, 'default_payment'),
    fuel_billing: text(form, 'fuel_billing'),
  };
  if (!row.name) return { ok: false, message: '업체 이름을 넣어 주세요.' };
  if (!['cash', 'postpaid'].includes(row.default_payment)) return { ok: false, message: '결제 방식을 골라 주세요.' };
  if (!['customer', 'company'].includes(row.fuel_billing)) return { ok: false, message: '주유비 부담을 골라 주세요.' };
  const r = id
    ? await ctx.supabase.from('companies').update(row).eq('id', id).select('id')
    : await ctx.supabase.from('companies').insert(row).select('id');
  if (r.error || !r.data?.length) return SAVE_FAILED;
  revalidatePath('/admin/companies');
  return { ok: true, message: id ? '저장했어요.' : `'${row.name}' 업체를 등록했어요.` };
}

export async function setDriverStatus(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const status = text(form, 'status');
  if (!['pending', 'active', 'suspended'].includes(status)) return { ok: false, message: '상태가 잘못됐어요.' };
  const r = await ctx.supabase.from('profiles').update({ driver_status: status })
    .eq('id', text(form, 'id')).eq('role', 'driver').select('id');
  if (r.error || !r.data?.length) return SAVE_FAILED;
  revalidatePath('/admin/drivers');
  return { ok: true, message: status === 'active' ? '승인했어요.' : status === 'suspended' ? '정지했어요.' : '대기로 바꿨어요.' };
}

export async function setCommission(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const raw = text(form, 'rate');
  const rate = raw === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, message: '수수료율은 0에서 100 사이로 넣어 주세요.' };
  const r = await ctx.supabase.from('driver_rates')
    .upsert({ driver_id: text(form, 'id'), commission_rate: rate, updated_at: new Date().toISOString() })
    .select('driver_id');
  if (r.error || !r.data?.length) return SAVE_FAILED;
  revalidatePath('/admin/drivers');
  return { ok: true, message: `수수료율 ${rate}%로 저장했어요.` };
}

export async function setStaffLevel(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return NOT_ADMIN;
  const id = text(form, 'id');
  const level = text(form, 'staffLevel');
  if (level !== 'admin' && level !== 'operator') return { ok: false, message: '등급을 골라 주세요.' };
  if (id === ctx.me.id) return { ok: false, message: '자기 등급은 바꿀 수 없어요. 다른 관리자에게 부탁해 주세요.' };
  const r = await ctx.supabase.from('profiles').update({ staff_level: level })
    .eq('id', id).eq('role', 'staff').select('id');
  if (r.error || !r.data?.length) return SAVE_FAILED;
  revalidatePath('/admin/staff');
  return { ok: true, message: '등급을 바꿨어요.' };
}
