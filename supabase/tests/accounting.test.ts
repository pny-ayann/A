import { as, createUser, createWorld, expectError } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
let acc: string;
beforeEach(async () => {
  w = await createWorld();
  acc = await createUser(w.db, { loginId: 'acc1', role: 'staff', staffLevel: 'accounting' });
  await w.db.query(`update settings set settlement_start_at = '2026-01-01T00:00:00Z'`);
});

describe('정산 등급이 할 수 있는 것', () => {
  test('충전금 넣기·업체 정산 보기·입금 체크', async () => {
    await as(w.db, acc, tx => tx.query(`select admin_wallet_entry($1, 'topup', 10000, null)`, [w.d]));
    await as(w.db, acc, tx => tx.query(`select * from billing_totals('2026-11-01')`));
    await as(w.db, acc, tx => tx.query(`select set_company_paid($1::uuid, '2026-11-01'::date, true, 0)`, [w.A]));
    expect((await w.db.query('select 1 from company_payments where company_id=$1', [w.A])).rows).toHaveLength(1);
  });

  test('출금 처리', async () => {
    await w.db.query(`insert into wallet_entries(driver_id, amount, kind, label) values ($1, 50000, 'topup', '충전')`, [w.d]);
    await as(w.db, w.d, tx => tx.query(`insert into bank_accounts(driver_id, bank, number, holder) values ($1, '국민', '123-456', '김기사')`, [w.d]));
    const id = (await as(w.db, w.d, tx => tx.query<{ id: string }>('select request_withdrawal(10000) as id'))).rows[0]!.id;
    expect((await as(w.db, acc, tx => tx.query('select 1 from bank_accounts where driver_id=$1', [w.d]))).rows).toHaveLength(1);
    expect((await as(w.db, acc, tx => tx.query('select 1 from withdrawal_requests where id=$1', [id]))).rows).toHaveLength(1);
    await as(w.db, acc, tx => tx.query(`select process_withdrawal($1, 'paid', null)`, [id]));
  });

  test('업체 추가·고치기, 기사 상태·수수료 바꾸기', async () => {
    await as(w.db, acc, tx => tx.query(`insert into companies(name) values ('새상사')`));
    await as(w.db, acc, tx => tx.query(`update companies set name='바뀐상사' where id=$1`, [w.A]));
    expect((await w.db.query<{ name: string }>('select name from companies where id=$1', [w.A])).rows[0]!.name).toBe('바뀐상사');
    await as(w.db, acc, tx => tx.query(`update profiles set driver_status='suspended' where id=$1`, [w.d]));
    expect((await w.db.query<{ s: string }>('select driver_status s from profiles where id=$1', [w.d])).rows[0]!.s).toBe('suspended');
    await as(w.db, acc, tx => tx.query(`insert into driver_rates(driver_id, commission_rate) values ($1, 15)
      on conflict (driver_id) do update set commission_rate = 15`, [w.d]));
  });
});

describe('정산 등급이 못 하는 것', () => {
  test('직원 계정·자기 등급·기사 역할은 못 바꾼다', async () => {
    await as(w.db, acc, tx => tx.query(`update profiles set staff_level='admin' where id=$1`, [w.op]));
    expect((await w.db.query<{ l: string }>('select staff_level l from profiles where id=$1', [w.op])).rows[0]!.l).toBe('operator');
    await as(w.db, acc, tx => tx.query(`update profiles set staff_level='admin' where id=$1`, [acc])).catch(() => undefined);
    expect((await w.db.query<{ l: string }>('select staff_level l from profiles where id=$1', [acc])).rows[0]!.l).toBe('accounting');
    await as(w.db, acc, tx => tx.query(`update profiles set role='staff', staff_level='admin' where id=$1`, [w.d])).catch(() => undefined);
    expect((await w.db.query<{ r: string }>('select role r from profiles where id=$1', [w.d])).rows[0]!.r).toBe('driver');
  });

  test('운영 설정·요금표·변경 기록·업체 삭제는 관리자만', async () => {
    await as(w.db, acc, tx => tx.query('update settings set release_min_takson = 99'));
    expect((await w.db.query<{ v: number }>('select release_min_takson v from settings')).rows[0]!.v).toBe(10);
    await as(w.db, acc, tx => tx.query(`insert into missions(name, extra_fare) values ('x', 1)`)).catch(() => undefined);
    expect((await w.db.query(`select 1 from missions where name='x'`)).rows).toHaveLength(0);
    expect((await as(w.db, acc, tx => tx.query('select 1 from audit_log'))).rows).toHaveLength(0);
    await as(w.db, acc, tx => tx.query('delete from companies where id=$1', [w.B]));
    expect((await w.db.query('select 1 from companies where id=$1', [w.B])).rows).toHaveLength(1);
  });

  test('일반 관제는 여전히 정산을 못 한다', async () => {
    await expectError(as(w.db, w.op, tx => tx.query(`select * from billing_totals('2026-11-01')`)), 'FORBIDDEN');
  });
});
