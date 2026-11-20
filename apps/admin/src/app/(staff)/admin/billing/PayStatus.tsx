import { kstDate, payState } from '@/lib/billing/month';
import { won } from '@/lib/wallet/format';

/** 입금 상태 글자: 입금 완료 / 금액이 달라졌어요 / 더 받은 돈 / 미입금 */
export function PayStatus({ total, paidAmount, paidAt }: { total: number; paidAmount: number | null; paidAt: string | null }) {
  const s = payState(total, paidAmount);
  if (s.kind === 'paid') return <span className="text-green-700">입금 완료 {paidAt ? kstDate(paidAt).slice(5).replace('-', '/') : ''}</span>;
  if (s.kind === 'changed') {
    return (
      <span className="text-amber-700">
        금액이 달라졌어요 (체크 때 {won(paidAmount ?? 0)}){s.extra > 0 ? ` · 더 받은 돈 ${won(s.extra)}` : ''}
      </span>
    );
  }
  if (s.kind === 'unpaid') return <span className="text-red-600">미입금</span>;
  return null;
}
