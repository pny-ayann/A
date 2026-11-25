import { entryStatus } from '@takson/shared';
import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { kstShort, won } from '@/lib/time';
import { useWallet } from '@/lib/wallet/useWallet';
import { BigButton, Body, Card, color, Notice, Screen, Title } from '@/ui/kit';

const REQ_LABEL = { requested: '신청됨', paid: '지급 완료', rejected: '거절' } as const;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: strong ? 18 : 16, color: strong ? color.text : color.sub, fontWeight: strong ? '700' : '400' }}>{label}</Text>
      <Text style={{ fontSize: strong ? 22 : 16, color: color.text, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

/** 충전금: 잔액·출금 가능·들어올 예정, 출금 신청, 받을 계좌, 내역 (설계 2단계-1 7장) */
export default function Wallet() {
  const { summary, entries, requests, account } = useWallet();
  const now = new Date();
  const reqOf = new Map(requests.map(r => [r.id, r]));

  return (
    <Screen>
      <Title>충전금</Title>
      {summary && summary.balance < 0 && (
        <Notice tone="danger">충전금이 마이너스라 오더를 잡을 수 없어요. 충전 후 다시 잡아 주세요.</Notice>
      )}
      <Card>
        <Row label="충전금 잔액" value={summary ? won(summary.balance) : '…'} strong />
        <Row label="출금 가능" value={summary ? won(summary.withdrawable) : '…'} />
        {!!summary && summary.pending !== 0 && <Row label="들어올 예정 (완료 10분 뒤)" value={won(summary.pending)} />}
        {!!account && <Body sub style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: 8 }}>받을 계좌: {account.bank} {account.number} ({account.holder})</Body>}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <BigButton label="출금 신청" onPress={() => router.push('/wallet/withdraw' as Href)} disabled={!summary || summary.withdrawable < 1} />
        </View>
        <View style={{ flex: 1 }}>
          <BigButton label={account ? '받을 계좌' : '계좌 등록'} tone="plain" onPress={() => router.push('/wallet/account' as Href)} />
        </View>
      </View>

      <Card>
        <Text style={{ fontSize: 14, color: color.sub, fontWeight: '700' }}>내역</Text>
        {entries.length === 0 && <Body sub>아직 내역이 없어요.</Body>}
        {entries.map(e => {
          const status = e.kind === 'withdraw' && e.ref_id ? REQ_LABEL[reqOf.get(e.ref_id)?.status ?? 'requested'] : entryStatus(e, now);
          return (
            <View key={e.id} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: color.line }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, color: color.text }}>{e.label}</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: e.amount < 0 ? color.danger : color.ok }}>
                  {e.amount > 0 ? '+' : '−'}{won(Math.abs(e.amount))}
                </Text>
              </View>
              <Body sub>{kstShort(e.created_at)}{status ? ` · ${status}` : ''}</Body>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
