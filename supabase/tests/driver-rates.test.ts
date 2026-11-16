// 기사 수수료율은 관제와 그 기사 본인만 본다
import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => {
  w = await createWorld();
  await as(w.db, w.admin, tx => tx.query(
    'insert into driver_rates(driver_id, commission_rate) values ($1, 20)', [w.d]));
});

test('profiles에는 수수료율 칸이 없다', async () => {
  const r = await w.db.query(`select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='commission_rate'`);
  expect(r.rows).toHaveLength(0);
});

test('고객은 자기 오더 기사의 이름은 보지만 수수료율은 못 본다', async () => {
  await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
  expect((await as(w.db, w.a, tx => tx.query('select name from profiles where id=$1', [w.d]))).rows).toEqual([{ name: '김기사' }]);
  expect((await as(w.db, w.a, tx => tx.query('select * from driver_rates'))).rows).toHaveLength(0);
});

test('기사는 자기 수수료율만 본다', async () => {
  await as(w.db, w.admin, tx => tx.query('insert into driver_rates(driver_id, commission_rate) values ($1, 15)', [w.d2]));
  expect((await as(w.db, w.d, tx => tx.query('select commission_rate from driver_rates'))).rows).toEqual([{ commission_rate: '20.00' }]);
});

test('관제는 모두 보고, 수수료율은 관리자만 바꾼다', async () => {
  expect((await as(w.db, w.op, tx => tx.query('select driver_id from driver_rates'))).rows).toHaveLength(1);
  const r = await as(w.db, w.op, tx => tx.query('update driver_rates set commission_rate = 5'));
  expect(r.affectedRows).toBe(0);
  await expectError(as(w.db, w.d, tx => tx.query('insert into driver_rates(driver_id, commission_rate) values ($1, 0)', [w.d2])), 'row-level security');
});

test('수수료율 변경은 감사 기록에 남는다', async () => {
  await as(w.db, w.admin, tx => tx.query('update driver_rates set commission_rate = 25 where driver_id=$1', [w.d]));
  const log = await w.db.query(`select actor_id from audit_log where table_name='driver_rates' and action='UPDATE'`);
  expect(log.rows).toEqual([{ actor_id: w.admin }]);
});
