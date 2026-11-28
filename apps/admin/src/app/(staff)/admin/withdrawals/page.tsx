import { redirect } from 'next/navigation';
import { ActionForm, inputCls } from '@/components/ActionForm';
import { processWithdrawal } from '@/lib/wallet/actions';
import { kst, won } from '@/lib/wallet/format';
import { canSettle } from '@/lib/auth/gate';
import { getStaffProfile, serverClient } from '@/lib/supabase/server';

type Req = {
  id: string; driver_id: string; amount: number; status: 'requested' | 'paid' | 'rejected';
  bank: string; number: string; holder: string; memo: string | null; reason: string | null;
  created_at: string; processed_at: string | null;
};
const STATUS = { requested: '대기', paid: '지급 완료', rejected: '거절' } as const;

/** 출금 신청 처리 (관리자): 직접 이체한 뒤 '지급 완료', 아니면 사유를 적고 '거절' */
export default async function WithdrawalsPage() {
  const me = await getStaffProfile();
  if (!canSettle(me?.staff_level)) redirect('/orders');
  const supabase = await serverClient();
  const [reqs, drivers] = await Promise.all([
    supabase.from('withdrawal_requests').select('id, driver_id, amount, status, bank, number, holder, memo, reason, created_at, processed_at')
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('id, name, login_id').eq('role', 'driver'),
  ]);
  const nameOf = new Map((drivers.data ?? []).map(d => [d.id as string, (d.name as string | null) ?? (d.login_id as string)]));
  const list = (reqs.data ?? []) as Req[];
  const waiting = list.filter(r => r.status === 'requested').reverse(); // 오래된 신청 먼저
  const done = list.filter(r => r.status !== 'requested');

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-bold">출금 신청</h1>
      <section className="space-y-3">
        {reqs.error
          ? <p className="text-sm text-red-600">출금 신청을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
          : <h2 className="font-semibold">대기 {waiting.length}건</h2>}
        {!reqs.error && waiting.length === 0 && <p className="text-sm text-slate-500">처리할 신청이 없어요.</p>}
        {waiting.map(r => (
          <div key={r.id} className="space-y-2 rounded border p-3 text-sm">
            <div><b>{nameOf.get(r.driver_id) ?? '기사'}</b> · <b className="text-lg">{won(r.amount)}</b> · {r.bank} {r.number} ({r.holder}) · {kst(r.created_at)} 신청</div>
            <ActionForm action={processWithdrawal} submit="지급 완료" primary>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="result" value="paid" />
              <input name="note" placeholder="메모 (선택, 예: 국민 이체)" aria-label="지급 메모" className={`${inputCls} w-64`} />
            </ActionForm>
            <ActionForm action={processWithdrawal} submit="거절">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="result" value="rejected" />
              <input name="note" placeholder="거절 사유 (필수)" aria-label="거절 사유" required className={`${inputCls} w-64`} />
            </ActionForm>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-2 font-semibold">처리한 신청</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-1">신청</th><th>기사</th><th className="text-right">금액</th><th>계좌</th><th>결과</th><th>처리</th></tr></thead>
          <tbody>
            {done.map(r => (
              <tr key={r.id} className="border-b">
                <td className="py-1 whitespace-nowrap">{kst(r.created_at)}</td>
                <td>{nameOf.get(r.driver_id) ?? '기사'}</td>
                <td className="text-right">{won(r.amount)}</td>
                <td>{r.bank} {r.number}</td>
                <td className={r.status === 'rejected' ? 'text-red-600' : 'text-green-700'}>{STATUS[r.status]}{r.reason ? `: ${r.reason}` : r.memo ? ` (${r.memo})` : ''}</td>
                <td className="whitespace-nowrap">{r.processed_at ? kst(r.processed_at) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
