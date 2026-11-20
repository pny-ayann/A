import Link from 'next/link';
import { redirect } from 'next/navigation';
import { inputCls } from '@/components/ActionForm';
import { parseMonth } from '@/lib/billing/month';
import { won } from '@/lib/wallet/format';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';
import { PaidCheckbox } from './PaidCheckbox';
import { PayStatus } from './PayStatus';

type Row = {
  company_id: string; company_name: string; supply: number; vat: number; fuel: number; total: number;
  paid_amount: number | null; paid_at: string | null;
};
type Due = { company_id: string; company_name: string; month: string; due: number };

const ym = (d: string) => d.slice(0, 7);
const label = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;

/** 업체 정산 (관리자): 달을 고르면 업체별 청구금액과 입금 체크, 아래에 미수금 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await getStaffProfile();
  if (me?.staff_level !== 'admin') redirect('/orders');
  const month = parseMonth((await searchParams).month, new Date());
  const supabase = await serverClient();
  const [sum, dues] = await Promise.all([
    supabase.rpc('billing_summary', { p_month: `${month}-01` }),
    supabase.rpc('billing_receivables'),
  ]);
  const rows = (sum.data ?? []) as Row[];
  const dueList = (dues.data ?? []) as Due[];
  const dueTotal = dueList.reduce((a, d) => a + d.due, 0);
  const failed = sum.error || dues.error;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">업체 정산</h1>
        <form method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={month} aria-label="정산 달" className={inputCls} />
          <button className="rounded border px-3 py-1 text-sm hover:bg-slate-50">보기</button>
        </form>
      </div>
      <p className="text-sm text-slate-600">
        {label(month)}에 완료된 후불 오더예요. 부가세는 요금에만 붙고, 주유비는 실비로 더해요. 세금계산서는 홈택스에서 공급가액·부가세를 옮겨 적어 주세요.
      </p>
      {failed && <p className="text-sm text-red-600">정산 금액을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">이 달에는 정산할 후불 오더가 없어요.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1">업체</th><th className="text-right">공급가액</th><th className="text-right">부가세</th>
              <th className="text-right">주유비</th><th className="text-right">청구금액</th><th className="pl-4">입금</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.company_id} className="border-b">
                <td className="py-1">{r.company_name}</td>
                <td className="text-right">{won(r.supply)}</td>
                <td className="text-right">{won(r.vat)}</td>
                <td className="text-right">{won(r.fuel)}</td>
                <td className="text-right font-semibold">{won(r.total)}</td>
                <td className="pl-4">
                  <span className="inline-flex items-center gap-2">
                    <PaidCheckbox key={`${r.paid_amount}-${r.total}`} company={r.company_id} month={month} paid={r.paid_amount !== null} total={r.total} label={r.company_name} />
                    <PayStatus total={r.total} paidAmount={r.paid_amount} paidAt={r.paid_at} />
                  </span>
                </td>
                <td className="space-x-2 text-right whitespace-nowrap">
                  <Link href={`/admin/billing/${r.company_id}?month=${month}`} className="text-blue-700 underline">보기</Link>
                  <a href={`/api/billing/excel?company=${r.company_id}&month=${month}`} className="text-blue-700 underline">엑셀</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">미수금 합계 {won(dueTotal)}</h2>
        <p className="text-xs text-slate-500">지난 달까지 아직 다 받지 못한 금액이에요. 이번 달은 진행 중이라 넣지 않아요.</p>
        {dueList.length === 0 ? (
          <p className="text-sm text-slate-500">미수금이 없어요.</p>
        ) : (
          <ul className="text-sm">
            {dueList.map(d => (
              <li key={`${d.company_id}-${d.month}`} className="flex gap-3 border-b py-1">
                <span className="w-40">{d.company_name}</span>
                <span className="w-28">{label(ym(d.month))}</span>
                <span className="w-28 text-right font-semibold">{won(d.due)}</span>
                <Link href={`/admin/billing/${d.company_id}?month=${ym(d.month)}`} className="text-blue-700 underline">보기</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
