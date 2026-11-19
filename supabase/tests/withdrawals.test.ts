import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => {
  w = await createWorld();
  await w.db.query(`update settings set settlement_start_at = '2026-01-01T00:00:00Z'`);
  await w.db.query(`insert into push_tokens(user_id, token) values ($1, 'T_d')`, [w.d]);
});

const entries = async (driver: string) =>
  (await w.db.query<{ amount: number; kind: string; label: string }>(
    'select amount, kind, label from wallet_entries where driver_id = $1 order by created_at, id', [driver])).rows;
const summary = async (driver: string) =>
  (await as(w.db, driver, tx => tx.query<{ balance: number; withdrawable: number; pending: number }>(
    'select balance, withdrawable, pending from wallet_summary($1)', [driver]))).rows[0]!;
const give = (driver: string, amount: number) =>
  as(w.db, w.admin, tx => tx.query(`select admin_wallet_entry($1, 'topup', $2, null)`, [driver, amount]));
const account = (driver: string) =>
  as(w.db, driver, tx => tx.query(`insert into bank_accounts(driver_id, bank, number, holder) values ($1, '국민', '123-456', '김기사')`, [driver]));
const request = (driver: string, amount: number) =>
  as(w.db, driver, tx => tx.query<{ id: string }>('select request_withdrawal($1) as id', [amount]));
const pushes = async () =>
  (await w.db.query<{ body: { to: string; title: string; body: string; data: { screen: string } }[] }>('select body from net.http_requests_log order by id')).rows.flatMap(r => r.body);

describe('배차 막기', () => {
  test('잔액이 마이너스면 기사가 잡을 수 없고 관제도 배정할 수 없다', async () => {
    const done = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 30000, payment_method: 'cash' });
    await w.db.query(`update orders set status = 'completed' where id = $1`, [done]);
    expect((await summary(w.d)).balance).toBe(-6000);
    const o = await seedOrder(w.db, w.A);
    await expectError(as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o])), 'BALANCE_NEGATIVE');
    await expectError(as(w.db, w.op, tx => tx.query('select staff_assign($1, $2)', [o, w.d])), 'BALANCE_NEGATIVE');
    await give(w.d, 6000);
    await as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o]));
  });

  test('정산이 꺼져 있으면 마이너스 검사를 하지 않는다', async () => {
    await w.db.query(`insert into wallet_entries(driver_id, amount, kind, label) values ($1, -1000, 'adjust', '조정: x')`, [w.d]);
    await w.db.query('update settings set settlement_start_at = null');
    const o = await seedOrder(w.db, w.A);
    await as(w.db, w.d, tx => tx.query('select claim_order($1, null, null)', [o]));
  });
});

describe('출금', () => {
  test('계좌가 없으면 출금 신청 불가', async () => {
    await give(w.d, 10000);
    await expectError(request(w.d, 1000), 'NO_BANK_ACCOUNT');
  });

  test('출금 가능 금액까지만 신청, 신청 순간 잡아 둔다', async () => {
    await give(w.d, 4000);
    await account(w.d);
    await expectError(request(w.d, 4001), 'OVER_WITHDRAWABLE');
    await expectError(request(w.d, 0), 'INVALID_AMOUNT');
    await request(w.d, 4000);
    expect(await summary(w.d)).toEqual({ balance: 0, withdrawable: 0, pending: 0 });
    expect((await entries(w.d)).at(-1)).toMatchObject({ amount: -4000, kind: 'withdraw', label: '출금 신청' });
    const r = (await w.db.query('select status, bank, number, holder from withdrawal_requests')).rows[0];
    expect(r).toEqual({ status: 'requested', bank: '국민', number: '123-456', holder: '김기사' });
  });

  test('동시에 두 번 신청해도 출금 가능 금액을 넘지 않는다', async () => {
    await give(w.d, 4000);
    await account(w.d);
    const r = await Promise.allSettled([request(w.d, 4000), request(w.d, 4000)]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect((await summary(w.d)).balance).toBe(0);
  });

  test('정산이 꺼져 있으면 신청 불가', async () => {
    await give(w.d, 4000);
    await account(w.d);
    await w.db.query('update settings set settlement_start_at = null');
    await expectError(request(w.d, 1000), 'SETTLEMENT_OFF');
  });

  test('관리자가 지급 완료하면 상태와 처리자가 남고 기사에게 알림', async () => {
    await give(w.d, 4000);
    await account(w.d);
    const id = (await request(w.d, 4000)).rows[0]!.id;
    await w.db.query('delete from net.http_requests_log');
    await as(w.db, w.admin, tx => tx.query(`select process_withdrawal($1, 'paid', '국민 이체')`, [id]));
    const r = (await w.db.query('select status, memo, processed_by from withdrawal_requests where id = $1', [id])).rows[0];
    expect(r).toEqual({ status: 'paid', memo: '국민 이체', processed_by: w.admin });
    expect(await pushes()).toEqual([expect.objectContaining({ to: 'T_d', title: '출금 완료', body: '4,000원', data: { screen: 'wallet' } })]);
  });

  test('거절하면 사유가 필요하고 금액이 되돌아온다', async () => {
    await give(w.d, 4000);
    await account(w.d);
    const id = (await request(w.d, 4000)).rows[0]!.id;
    await expectError(as(w.db, w.admin, tx => tx.query(`select process_withdrawal($1, 'rejected', '')`, [id])), 'REASON_REQUIRED');
    await as(w.db, w.admin, tx => tx.query(`select process_withdrawal($1, 'rejected', '계좌 확인 필요')`, [id]));
    expect((await entries(w.d)).at(-1)).toMatchObject({ amount: 4000, kind: 'withdraw_reject', label: '출금 거절: 계좌 확인 필요' });
    expect(await summary(w.d)).toEqual({ balance: 4000, withdrawable: 4000, pending: 0 });
    expect((await pushes()).at(-1)).toMatchObject({ title: '출금 거절', body: '4,000원 · 계좌 확인 필요' });
  });

  test('이미 처리된 신청은 다시 처리할 수 없다', async () => {
    await give(w.d, 4000);
    await account(w.d);
    const id = (await request(w.d, 4000)).rows[0]!.id;
    await as(w.db, w.admin, tx => tx.query(`select process_withdrawal($1, 'paid', null)`, [id]));
    await expectError(as(w.db, w.admin, tx => tx.query(`select process_withdrawal($1, 'rejected', 'x')`, [id])), 'ALREADY_PROCESSED');
  });
});

describe('권한', () => {
  test('일반 관제는 출금 처리·충전·조정을 할 수 없고 계좌를 볼 수 없다', async () => {
    await give(w.d, 4000);
    await account(w.d);
    const id = (await request(w.d, 1000)).rows[0]!.id;
    await expectError(as(w.db, w.op, tx => tx.query(`select process_withdrawal($1, 'paid', null)`, [id])), 'FORBIDDEN');
    await expectError(as(w.db, w.op, tx => tx.query(`select admin_wallet_entry($1, 'topup', 1000, null)`, [w.d])), 'FORBIDDEN');
    expect((await as(w.db, w.op, tx => tx.query('select * from bank_accounts'))).rows).toEqual([]);
    expect((await as(w.db, w.op, tx => tx.query('select * from withdrawal_requests'))).rows).toEqual([]);
    expect((await as(w.db, w.admin, tx => tx.query('select * from bank_accounts'))).rows).toHaveLength(1);
  });

  test('기사는 남의 계좌·신청을 볼 수 없다', async () => {
    await give(w.d, 4000);
    await account(w.d);
    await request(w.d, 1000);
    expect((await as(w.db, w.d2, tx => tx.query('select * from bank_accounts'))).rows).toEqual([]);
    expect((await as(w.db, w.d2, tx => tx.query('select * from withdrawal_requests'))).rows).toEqual([]);
    expect((await as(w.db, w.d, tx => tx.query('select * from withdrawal_requests'))).rows).toHaveLength(1);
  });
});

describe('관리자 충전·조정·정산 시작', () => {
  test('start_settlement: 시작 잔액 줄을 넣고 정산을 켠다, 두 번은 안 된다', async () => {
    await w.db.query('update settings set settlement_start_at = null');
    await as(w.db, w.admin, tx => tx.query('select start_settlement($1::jsonb)',
      [JSON.stringify([{ driver_id: w.d, amount: 35000 }, { driver_id: w.d2, amount: -3000 }, { driver_id: w.dp, amount: 0 }])]));
    expect(await entries(w.d)).toEqual([{ amount: 35000, kind: 'opening', label: '시작 잔액' }]);
    expect(await entries(w.d2)).toEqual([{ amount: -3000, kind: 'opening', label: '시작 잔액' }]);
    expect(await entries(w.dp)).toEqual([]);
    expect((await w.db.query('select settlement_start_at is not null as on from settings')).rows[0]).toEqual({ on: true });
    await expectError(as(w.db, w.admin, tx => tx.query(`select start_settlement('[]'::jsonb)`)), 'INVALID_TRANSITION');
  });

  test('조정은 사유가 필요하고 충전은 + 만', async () => {
    await expectError(as(w.db, w.admin, tx => tx.query(`select admin_wallet_entry($1, 'adjust', -3000, '')`, [w.d])), 'REASON_REQUIRED');
    await expectError(as(w.db, w.admin, tx => tx.query(`select admin_wallet_entry($1, 'topup', -3000, null)`, [w.d])), 'INVALID_AMOUNT');
    await as(w.db, w.admin, tx => tx.query(`select admin_wallet_entry($1, 'adjust', -3000, '요금 잘못 입력')`, [w.d]));
    await give(w.d, 10000);
    expect(await entries(w.d)).toEqual([
      { amount: -3000, kind: 'adjust', label: '조정: 요금 잘못 입력' },
      { amount: 10000, kind: 'topup', label: '충전' },
    ]);
  });
});
