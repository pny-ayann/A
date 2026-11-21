import { errorMessage, validateWithdraw } from '@takson/shared';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { won } from '@/lib/time';
import { useWallet } from '@/lib/wallet/useWallet';
import { BigButton, Body, Card, Field, Notice, Screen } from '@/ui/kit';

/** 출금 신청: 출금 가능 금액까지. 관리자가 이체하고 '지급 완료'를 누르면 알림이 온다 */
export default function Withdraw() {
  const { summary, account, reload } = useWallet();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noAccount = !!summary && !account; // summary와 account는 같이 불러오므로, 불러오기 전엔 '계좌 없음'으로 보지 않는다

  async function send() {
    setError(null);
    if (!summary) return;
    const amount = Number(text);
    const problem = validateWithdraw(amount, summary, !!account);
    if (problem) { setError(problem); return; }
    setBusy(true);
    const { error: e } = await supabase.rpc('request_withdrawal', { p_amount: amount });
    setBusy(false);
    if (e) { setError(errorMessage(e.message)); void reload(); return; }
    if (router.canGoBack()) router.back(); else router.replace('/wallet' as Href);
  }

  return (
    <Screen>
      <Card>
        <Body>출금 가능 {summary ? won(summary.withdrawable) : '…'}</Body>
        {account
          ? <Body sub>받을 계좌: {account.bank} {account.number} ({account.holder})</Body>
          : noAccount && <Notice tone="danger">받을 계좌를 먼저 등록해 주세요.</Notice>}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 3 }}>
          <Field label="출금할 금액 (원)" keyboardType="number-pad" value={text} onChangeText={t => setText(t.replace(/[^0-9]/g, ''))} />
        </View>
        <View style={{ flex: 1 }}>
          <BigButton label="전액" tone="plain" onPress={() => setText(String(summary?.withdrawable ?? 0))} />
        </View>
      </View>
      {!!error && <Notice tone="danger">{error}</Notice>}
      {!noAccount
        ? <BigButton label="출금 신청" busy={busy} onPress={() => void send()} disabled={!text || !account} />
        : <BigButton label="계좌 등록하러 가기" onPress={() => router.replace('/wallet/account' as Href)} />}
      <Body sub>신청한 금액은 바로 잔액에서 빠지고, 관리자가 이체하면 알림이 와요. 거절되면 다시 돌아와요.</Body>
    </Screen>
  );
}
