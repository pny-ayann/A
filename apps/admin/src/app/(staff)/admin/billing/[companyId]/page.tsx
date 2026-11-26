import Link from 'next/link';
import { redirect } from 'next/navigation';
import { kstDate, monthRange, parseMonth } from '@/lib/billing/month';
import type { BillingLine } from '@/lib/billing/excel';
import { won } from '@/lib/wallet/format';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';
import { PaidCheckbox } from '../PaidCheckbox';
import { PayStatus } from '../PayStatus';

type Row = { company_id: string; supply: number; vat: number; fuel: number; total: number; paid_amount: number | null; paid_at: string | null };

/** 업체 한 곳의 한 달 정산서 (관리자) */
export default async function CompanyBillingPage({ params, searchParams }: {
  params: Promise<{ companyId: string }>; searchParams: Promise<{ month?: string }>;
}) {
  const me = await getStaffProfile();
  if (me?.staff_level !== 'admin') redirect('/orders');
  const { companyId } = await params;
  const month = parseMonth((await searchParams).month, new Date());
  const supabase = await serverClient();
  const [company, lines, sum] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
    supabase.rpc('billing_lines', { p_company: companyId, p_month: `${month}-01` }),
    supabase.rpc('billing_summary', { p_month: `${month}-01` }),
  ]);
  const name = (company.data as { name: string } | null)?.name;
  if (!name) return <p className="text-sm text-slate-500">업체를 찾을 수 없어요.</p>;
  const failed = Boolean(lines.error || sum.error);
  const list = (lines.data ?? []) as BillingLine[];
  const t = ((sum.data ?? []) as Row[]).find(r => r.company_id === companyId)
    ?? { supply: 0, vat: 0, fuel: 0, total: 0, paid_amount: null, paid_at: null };

  return (
    <div className="max-w-5xl space-y-4">
      <Link href={`/admin/billing?month=${month}`} className="text-sm text-road underline">← 업체 정산</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{name} 정산서</h1>
        <a href={`/api/billing/excel?company=${companyId}&month=${month}`}
          className="rounded bg-road px-3 py-1 text-sm font-semibold text-white">엑셀 내려받기</a>
      </div>
      <p className="text-sm text-slate-600">기간 {monthRange(month)}</p>
      {failed && <p className="text-sm text-red-600">정산서를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>}

      {failed ? null : list.length === 0 ? (
        <p className="text-sm text-slate-500">이 달에는 정산할 후불 오더가 없어요.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1">오더 번호</th><th>완료일</th><th>출발 → 도착</th><th>차량번호</th><th>미션</th>
              <th className="text-right">요금</th><th className="text-right">주유비</th>
            </tr>
          </thead>
          <tbody>
            {list.map(l => (
              <tr key={l.order_no + l.completed_at} className="border-b">
                <td className="py-1">{l.order_no}</td>
                <td>{kstDate(l.completed_at)}</td>
                <td>{l.pickup_area} → {l.dropoff_area}</td>
                <td>{l.vehicle_number && <span className="plate">{l.vehicle_number}</span>}</td>
                <td>{l.missions}</td>
                <td className="text-right">{won(l.fare)}</td>
                <td className="text-right">{won(l.fuel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="ml-auto w-72 text-sm">
        <tbody>
          <tr><td className="py-0.5">공급가액</td><td className="text-right">{won(t.supply)}</td></tr>
          <tr><td className="py-0.5">부가세</td><td className="text-right">{won(t.vat)}</td></tr>
          <tr><td className="py-0.5">주유비(실비)</td><td className="text-right">{won(t.fuel)}</td></tr>
          <tr className="border-t font-bold"><td className="py-1">청구금액</td><td className="text-right">{won(t.total)}</td></tr>
        </tbody>
      </table>

      <div className="flex items-center justify-end gap-2 text-sm">
        <span>입금</span>
        <PaidCheckbox key={`${t.paid_amount}-${t.total}`} company={companyId} month={month} paid={t.paid_amount !== null} total={t.total} label={name} />
        <PayStatus total={t.total} paidAmount={t.paid_amount} paidAt={t.paid_at} />
      </div>
    </div>
  );
}
