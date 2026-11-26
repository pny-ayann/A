import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { payFuel } from '@/lib/wallet/actions';
import { kst, won } from '@/lib/wallet/format';
import { serverClient } from '@/lib/supabase/server';

type Claim = { receipt_id: string; order_id: string; order_no: string; driver_id: string; driver_name: string | null; company_name: string; amount: number; created_at: string };

/**
 * 주유비 청구 (관제 전체): 상황실이 주는 주유비 중 아직 안 준 것.
 * 한 건씩 '지급', 여러 건 골라 '선택 지급', 기사별 '전부 지급'.
 */
export default async function FuelPage() {
  const supabase = await serverClient();
  const { data } = await supabase.rpc('fuel_claims');
  const list = ((data ?? []) as Claim[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const byDriver = new Map<string, Claim[]>();
  for (const c of list) byDriver.set(c.driver_id, [...(byDriver.get(c.driver_id) ?? []), c]);

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-bold">주유비 청구</h1>
      <p className="text-sm text-slate-600">지급하면 기사님 충전금에 바로 들어가고 바로 출금할 수 있어요. 현금 오더처럼 업체가 직접 주는 주유비는 여기 나오지 않아요(업체 관리에서 바꿀 수 있어요).</p>
      {list.length === 0 && <p className="text-sm text-slate-500">지급할 주유비가 없어요.</p>}

      {[...byDriver.entries()].map(([driverId, claims]) => (
        <section key={driverId} className="space-y-2 rounded border p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{claims[0]!.driver_name ?? '기사'} · {claims.length}건 · {won(claims.reduce((s, c) => s + c.amount, 0))}</h2>
            <ActionForm action={payFuel} submit="이 기사 전부 지급">
              {claims.map(c => <input key={c.receipt_id} type="hidden" name="receipt" value={c.receipt_id} />)}
            </ActionForm>
          </div>
          <ActionForm action={payFuel} submit="선택 지급" primary className="space-y-2">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="w-8" /><th className="py-1">오더</th><th>업체</th><th>올린 시각</th><th className="text-right">금액</th></tr></thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.receipt_id} className="border-b">
                    <td><input type="checkbox" name="receipt" value={c.receipt_id} aria-label={`${c.order_no} 주유비 선택`} /></td>
                    <td className="py-1"><Link href={`/orders/${c.order_id}`} className="text-road underline">{c.order_no}</Link></td>
                    <td>{c.company_name}</td>
                    <td className="whitespace-nowrap">{kst(c.created_at)}</td>
                    <td className="text-right font-semibold">{won(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ActionForm>
          <div className="flex flex-wrap gap-2">
            {claims.map(c => (
              <ActionForm key={c.receipt_id} action={payFuel} submit={`${c.order_no} 지급`}>
                <input type="hidden" name="receipt" value={c.receipt_id} />
              </ActionForm>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
