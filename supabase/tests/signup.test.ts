// 기사 앱의 가입 신청이 기대는 서버 규칙 (이미 있는 규칙을 기사 앱 관점에서 확인)
import { as, createUser, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

test('스스로 가입하면 승인 대기 기사', async () => {
  const id = await createUser(w.db, { loginId: 'self1', selfSignup: true, name: '신청기사' });
  const p = await w.db.query<{ role: string; driver_status: string; name: string }>(
    'select role, driver_status, name from profiles where id = $1', [id]);
  expect(p.rows[0]).toEqual({ role: 'driver', driver_status: 'pending', name: '신청기사' });
});

test('스스로 가입할 때 역할을 관제로 바꿔 넣어도 기사 대기', async () => {
  const r = await w.db.query<{ id: string }>(
    `insert into auth.users(email, raw_app_meta_data, raw_user_meta_data) values ('sneak@takson.local', '{}', $1) returning id`,
    [JSON.stringify({ role: 'staff', staff_level: 'admin', name: '몰래' })]);
  const p = await w.db.query<{ role: string; staff_level: string | null }>(
    'select role, staff_level from profiles where id = $1', [r.rows[0]!.id]);
  expect(p.rows[0]).toEqual({ role: 'driver', staff_level: null });
});

test('자기 서류만 올릴 수 있다', async () => {
  const id = await createUser(w.db, { loginId: 'self2', selfSignup: true });
  await as(w.db, id, tx => tx.query(
    `insert into driver_documents(driver_id, kind, path) values ($1, 'license', $2)`, [id, `${id}/license.jpg`]));
  await expectError(as(w.db, id, tx => tx.query(
    `insert into driver_documents(driver_id, kind, path) values ($1, 'license', 'x')`, [w.d])), 'row-level security');
});

test('승인 전에는 오더를 잡을 수 없다', async () => {
  const id = await createUser(w.db, { loginId: 'self3', selfSignup: true });
  const order = await seedOrder(w.db, w.A);
  await expectError(as(w.db, id, tx => tx.query('select claim_order($1)', [order])), 'DRIVER_NOT_ACTIVE');
});
