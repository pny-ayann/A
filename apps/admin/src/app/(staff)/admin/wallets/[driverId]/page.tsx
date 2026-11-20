import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, inputCls } from '@/components/ActionForm';
import { walletEntry } from '@/lib/wallet/actions';
import { kst, won } from '@/lib/wallet/format';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

type Entry = { id: string; amount: number; label: string; created_at: string; effective_at: string; withdrawable_at: string | null };
type Summary = { balance: number; withdrawable: number; pending: number };

/** 기사 한 명의 충전금 장부 + 충전·조정 (관리자) */
export default async function DriverWalletPage({ params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await params;
  const me = await getStaffProfile();
  if (me?.staff_level !== 'admin') redirect('/orders');
  const supabase = await serverClient();
  const [driver, sum, entries, account] = await Promise.all([
    supabase.from('profiles').select('name, login_id, phone').eq('id', driverId).single(),
    supabase.rpc('wallet_summary', { p_driver: driverId }),
    supabase.from('wallet_entries').select('id, amount, label, created_at, effective_at, withdrawable_at')
      .eq('driver_id', driverId).order('created_at', { ascending: false }).limit(300),
    supabase.from('bank_accounts').select('bank, number, holder').eq('driver_id', driverId).maybeSingle(),
  ]);
  const d = driver.data as { name: string | null; login_id: string; phone: string | null } | null;
  if (!d) return <p>기사를 찾을 수 없어요.</p>;
  const s = ((sum.data ?? []) as Summary[])[0] ?? { balance: 0, withdrawable: 0, pending: 0 };
  const acc = account.data as { bank: string; number: string; holder: string } | null;
  const now = Date.now();

  return (
    <div className="max-w-4xl space-y-5">
      <Link href="/admin/wallets" className="text-sm text-blue-700 underline">← 충전금</Link>
      <h1 className="text-xl font-bold">{d.name ?? d.login_id} 충전금</h1>
      <div className="flex gap-6 text-sm">
        <div>잔액 <b className={s.balance < 0 ? 'text-red-600' : ''}>{won(s.balance)}</b></div>
        <div>출금 가능 <b>{won(s.withdrawable)}</b></div>
        <div>들어올 예정 <b>{won(s.pending)}</b></div>
        <div className="text-slate-500">받을 계좌: {acc ? `${acc.bank} ${acc.number} (${acc.holder})` : '없음'}</div>
      </div>

      <section className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">충전 (기사님이 입금한 돈)</h2>
        <ActionForm action={walletEntry} submit="충전" primary>
          <input type="hidden" name="driver" value={driverId} />
          <input type="hidden" name="kind" value="topup" />
          <input name="amount" placeholder="금액 (원)" aria-label="충전 금액" required className={`${inputCls} w-36 text-right`} />
          <input name="reason" placeholder="메모 (선택)" aria-label="충전 메모" className={`${inputCls} w-64`} />
        </ActionForm>
        <h2 className="pt-2 font-semibold">조정 (+ 또는 −, 사유 필수)</h2>
        <ActionForm action={walletEntry} submit="조정">
          <input type="hidden" name="driver" value={driverId} />
          <input type="hidden" name="kind" value="adjust" />
          <input name="amount" placeholder="예: -3000" aria-label="조정 금액" required className={`${inputCls} w-36 text-right`} />
          <input name="reason" placeholder="사유 (필수)" aria-label="조정 사유" required className={`${inputCls} w-64`} />
        </ActionForm>
      </section>

      <table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th className="py-1">시각</th><th>내용</th><th className="text-right">금액</th><th>상태</th></tr></thead>
        <tbody>
          {(entries.data as Entry[] | null ?? []).map(e => {
            const status = new Date(e.effective_at).getTime() > now ? `${kst(e.effective_at)} 들어옴`
              : e.withdrawable_at && e.amount > 0 && new Date(e.withdrawable_at).getTime() > now ? `${kst(e.withdrawable_at)}부터 출금` : '';
            return (
              <tr key={e.id} className="border-b">
                <td className="py-1 whitespace-nowrap">{kst(e.created_at)}</td>
                <td>{e.label}</td>
                <td className={`text-right font-semibold ${e.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>{e.amount > 0 ? '+' : ''}{won(e.amount)}</td>
                <td className="text-slate-500">{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
