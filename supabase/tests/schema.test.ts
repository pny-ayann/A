import { createDb, createUser, seedCompany, seedOrder } from './helpers/db';

test('관리자가 만든 고객 계정은 app_metadata대로 프로필이 생긴다', async () => {
  const db = await createDb();
  const c = await seedCompany(db);
  const id = await createUser(db, { loginId: 'sangsa1', role: 'customer', companyId: c });
  const p = (await db.query('select role, company_id, login_id from profiles where id=$1', [id])).rows[0];
  expect(p).toEqual({ role: 'customer', company_id: c, login_id: 'sangsa1' });
});

test('스스로 가입하면 role을 staff로 보내도 대기 중 기사가 된다', async () => {
  const db = await createDb();
  const id = await createUser(db, { loginId: 'hacker', role: 'staff', staffLevel: 'admin', selfSignup: true });
  const p = (await db.query('select role, driver_status, staff_level from profiles where id=$1', [id])).rows[0];
  expect(p).toEqual({ role: 'driver', driver_status: 'pending', staff_level: null });
});

test('관리자가 만든 기사 계정은 상태를 안 주면 대기 중', async () => {
  const db = await createDb();
  const id = await createUser(db, { loginId: 'driver1', role: 'driver' });
  const p = (await db.query('select role, driver_status from profiles where id=$1', [id])).rows[0];
  expect(p).toEqual({ role: 'driver', driver_status: 'pending' });
});

test('settings 기본값', async () => {
  const db = await createDb();
  const s = (await db.query('select * from settings')).rows[0];
  expect(s).toMatchObject({ release_min_takson: 10, release_min_daeri: 5, reservation_gap_min: 30, unassigned_alert_min: 10 });
});

test('잘못된 상태 값은 거부', async () => {
  const db = await createDb();
  const c = await seedCompany(db);
  await expect(seedOrder(db, c, { status: 'flying' })).rejects.toThrow();
});

test('기본값 오더가 만들어진다', async () => {
  const db = await createDb();
  const c = await seedCompany(db);
  const o = await seedOrder(db, c);
  const r = (await db.query('select status, kind, dispatch_mode, fare from orders where id=$1', [o])).rows[0];
  expect(r).toEqual({ status: 'open', kind: 'takson', dispatch_mode: 'open', fare: 50000 });
});
