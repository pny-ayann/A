import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, inputCls } from '@/components/ActionForm';
import { startSettlement } from '@/lib/wallet/actions';
import { kst, won } from '@/lib/wallet/format';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

type Driver = { id: string; name: string | null; login_id: string; driver_status: string };
type Summary = { balance: number; withdrawable: number; pending: number };

/** 기사별 충전금 (관리자). 정산이 꺼져 있으면 시작 잔액을 넣고 정산을 시작한다. */
export default async function WalletsPage() {
  const me = await getStaffProfile();
  if (me?.staff_level !== 'admin') redirect('/orders');
  const supabase = await serverClient();
  const [drivers, settings] = await Promise.all([
    supabase.from('profiles').select('id, name, login_id, driver_status').eq('role', 'driver').neq('driver_status', 'pending').order('name'),
    supabase.from('settings').select('settlement_start_at').eq('id', 1).single(),
  ]);
  const list = (drivers.data ?? []) as Driver[];
  const startedAt = (settings.data as { settlement_start_at: string | null } | null)?.settlement_start_at ?? null;

  if (!startedAt) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">정산 시작</h1>
        <p className="text-sm text-slate-600">
          지금 각 기사님 가상계좌에 남아 있는 금액을 그대로 넣어 주세요. [정산 시작]을 누르면 그 금액이 &lsquo;시작 잔액&rsquo;으로 들어가고,
          그 순간부터 끝나는 오더가 자동으로 정산돼요. 한 번만 할 수 있어요. 빈 칸은 0원이에요.
        </p>
        <ActionForm action={startSettlement} submit="정산 시작" primary className="space-y-2">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-1">기사</th><th>시작 잔액 (원, 마이너스 가능)</th></tr></thead>
            <tbody>
              {list.map(d => (
                <tr key={d.id} className="border-b">
                  <td className="py-1">
                    {d.name ?? d.login_id}
                    <input type="hidden" name="driver" value={d.id} />
                    <input type="hidden" name={`name_${d.id}`} value={d.name ?? d.login_id} />
                  </td>
                  <td><input name={`amount_${d.id}`} placeholder="0" aria-label={`${d.name ?? d.login_id} 시작 잔액`} className={`${inputCls} w-40 text-right`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ActionForm>
      </div>
    );
  }

  const sums = await Promise.all(list.map(async d => {
    const { data } = await supabase.rpc('wallet_summary', { p_driver: d.id });
    return ((data ?? []) as Summary[])[0] ?? { balance: 0, withdrawable: 0, pending: 0 };
  }));
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-bold">충전금</h1>
      <p className="text-sm text-slate-600">정산 시작: {kst(startedAt)} · 잔액이 마이너스면 오더를 잡거나 배정받을 수 없어요.</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th className="py-1">기사</th><th className="text-right">잔액</th><th className="text-right">출금 가능</th><th className="text-right">들어올 예정</th><th /></tr></thead>
        <tbody>
          {list.map((d, i) => (
            <tr key={d.id} className="border-b">
              <td className="py-1">{d.name ?? d.login_id}{d.driver_status === 'suspended' ? ' (정지)' : ''}</td>
              <td className={`text-right font-semibold ${sums[i]!.balance < 0 ? 'text-red-600' : ''}`}>{won(sums[i]!.balance)}</td>
              <td className="text-right">{won(sums[i]!.withdrawable)}</td>
              <td className="text-right text-slate-500">{won(sums[i]!.pending)}</td>
              <td className="text-right"><Link href={`/admin/wallets/${d.id}`} className="text-blue-700 underline">장부</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
