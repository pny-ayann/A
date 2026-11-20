import { errorMessage } from '@takson/shared';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/lib/wallet/useWallet';
import { BigButton, Body, Field, Notice, Screen } from '@/ui/kit';

/** 출금받을 계좌 (본인과 관리자만 볼 수 있어요) */
export default function BankAccount() {
  const { session } = useAuth();
  const { account } = useWallet();
  const [bank, setBank] = useState('');
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded || !account) return;
    setBank(account.bank); setNumber(account.number); setHolder(account.holder); setLoaded(true);
  }, [account, loaded]);

  async function save() {
    setError(null);
    if (!bank.trim() || !number.trim() || !holder.trim()) { setError('은행, 계좌번호, 예금주를 모두 넣어 주세요.'); return; }
    setBusy(true);
    const { error: e } = await supabase.from('bank_accounts').upsert({
      driver_id: session!.user.id, bank: bank.trim(), number: number.trim(), holder: holder.trim(), updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (e) { setError(errorMessage(e.message)); return; }
    if (router.canGoBack()) router.back(); else router.replace('/wallet' as Href);
  }

  return (
    <Screen>
      <Field label="은행" value={bank} onChangeText={setBank} placeholder="예: 국민은행" />
      <Field label="계좌번호" value={number} onChangeText={setNumber} keyboardType="number-pad" placeholder="숫자와 - 만" />
      <Field label="예금주" value={holder} onChangeText={setHolder} />
      {!!error && <Notice tone="danger">{error}</Notice>}
      <BigButton label="저장" busy={busy} onPress={() => void save()} />
      <Body sub>이 계좌는 본인과 관리자만 볼 수 있어요. 출금을 신청할 때의 계좌로 이체돼요.</Body>
    </Screen>
  );
}
