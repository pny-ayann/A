import { AccountFields, ActionForm, inputCls } from '@/components/ActionForm';
import { issueAccount, saveCompany } from '@/lib/accounts/actions';
import { canSettle } from '@/lib/auth/gate';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

type Company = { id: string; name: string; phone: string | null; default_payment: string; fuel_billing: string; fuel_payer_cash: string; fuel_payer_postpaid: string };

function CompanyFields({ c }: { c?: Company }) {
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="name" defaultValue={c?.name} placeholder="업체 이름" aria-label="업체 이름" required className={`${inputCls} w-40`} />
      <input name="phone" defaultValue={c?.phone ?? ''} placeholder="업체 전화" aria-label="업체 전화" className={`${inputCls} w-36`} />
      <select name="default_payment" defaultValue={c?.default_payment ?? 'postpaid'} aria-label="기본 결제" className={inputCls}>
        <option value="postpaid">후불</option>
        <option value="cash">현금</option>
      </select>
      <select name="fuel_billing" defaultValue={c?.fuel_billing ?? 'customer'} aria-label="주유비 부담" className={inputCls}>
        <option value="customer">주유비 고객 청구</option>
        <option value="company">주유비 회사 부담</option>
      </select>
      <select name="fuel_payer_cash" defaultValue={c?.fuel_payer_cash ?? 'company'} aria-label="현금 오더 주유비 지급" className={inputCls}>
        <option value="company">현금 오더 주유비: 업체 지급</option>
        <option value="office">현금 오더 주유비: 상황실 지급</option>
      </select>
      <select name="fuel_payer_postpaid" defaultValue={c?.fuel_payer_postpaid ?? 'office'} aria-label="후불 오더 주유비 지급" className={inputCls}>
        <option value="office">후불 오더 주유비: 상황실 지급</option>
        <option value="company">후불 오더 주유비: 업체 지급</option>
      </select>
    </>
  );
}

const PAY_LABEL: Record<string, string> = { postpaid: '후불', cash: '현금' };
const FUEL_LABEL: Record<string, string> = { customer: '주유비 고객 청구', company: '주유비 회사 부담' };

/** 관리자는 고치고 발급한다. 일반 관제는 보기만 한다 (설계 8.5) */
export default async function CompaniesPage() {
  const isAdmin = canSettle((await getStaffProfile())?.staff_level); // 관리자·정산은 고치기까지
  const supabase = await serverClient();
  const [companies, staff] = await Promise.all([
    supabase.from('companies').select('id, name, phone, default_payment, fuel_billing, fuel_payer_cash, fuel_payer_postpaid').order('name'),
    supabase.from('profiles').select('id, login_id, name, phone, company_id').eq('role', 'customer').order('login_id'),
  ]);
  const list = (companies.data ?? []) as Company[];
  return (
    <div className="max-w-5xl space-y-8">
      <section>
        <h1 className="mb-4 text-xl font-bold">{isAdmin ? '업체 관리' : '업체 조회'}</h1>
        <div className="space-y-6">
          {list.map(c => {
            const people = (staff.data ?? []).filter(p => p.company_id === c.id);
            return (
              <div key={c.id} className="rounded border p-4">
                {isAdmin
                  ? <ActionForm action={saveCompany} submit="저장"><CompanyFields c={c} /></ActionForm>
                  : <div className="text-sm"><b>{c.name}</b> · {c.phone ?? '전화 없음'} · {PAY_LABEL[c.default_payment] ?? c.default_payment} · {FUEL_LABEL[c.fuel_billing] ?? c.fuel_billing}</div>}
                <div className="mt-3 text-sm">
                  <div className="mb-1 font-semibold">업체 직원 계정 {people.length}개</div>
                  {people.length === 0 && <p className="text-slate-500">아직 없어요.</p>}
                  <ul className="mb-2 space-y-0.5">
                    {people.map(p => <li key={p.id}>{p.name} · <span className="text-slate-500">{p.login_id}</span> · {p.phone}</li>)}
                  </ul>
                  {isAdmin && <ActionForm action={issueAccount} submit="직원 계정 발급">
                    <input type="hidden" name="role" value="customer" />
                    <input type="hidden" name="companyId" value={c.id} />
                    <AccountFields />
                  </ActionForm>}
                </div>
              </div>
            );
          })}
          {list.length === 0 && <p className="text-sm text-slate-500">등록된 업체가 없어요.</p>}
        </div>
      </section>
      {isAdmin && (
        <section className="border-t pt-6">
          <h2 className="mb-3 text-lg font-bold">새 업체 등록</h2>
          <ActionForm action={saveCompany} submit="업체 등록" primary><CompanyFields /></ActionForm>
        </section>
      )}
    </div>
  );
}
