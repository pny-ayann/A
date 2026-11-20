/** 기사 충전금 (서버 wallet_summary 결과) */
export type WalletSummary = { balance: number; withdrawable: number; pending: number };

/** 출금 신청 전에 앱에서 먼저 검사. 괜찮으면 null (서버도 같은 규칙으로 다시 검사한다) */
export function validateWithdraw(amount: number, s: WalletSummary, hasAccount: boolean): string | null {
  if (!Number.isInteger(amount) || amount < 1) return '금액을 1원 이상으로 넣어 주세요.';
  if (amount > s.withdrawable) return '출금 가능 금액보다 많아요.';
  if (!hasAccount) return '받을 계좌를 먼저 등록해 주세요.';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 장부 한 줄 옆 안내: + 줄이 아직 출금 가능 시각 전이면 '11/20 12:00부터 출금' */
export function entryStatus(e: { kind: string; amount: number; withdrawable_at: string | null }, now: Date): string | null {
  if (e.amount <= 0 || !e.withdrawable_at) return null;
  const at = new Date(e.withdrawable_at);
  if (at.getTime() <= now.getTime()) return null;
  const k = new Date(at.getTime() + 9 * 3600_000); // 한국 시간
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}부터 출금`;
}
