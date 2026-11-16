import { as, createWorld, expectError } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

test('고객은 다른 업체 정보를 못 본다', async () => {
  const r = await as(w.db, w.a, tx => tx.query<{ id: string }>('select id from companies'));
  expect(r.rows.map(x => x.id)).toEqual([w.A]);
});

test('관제는 모든 업체를 본다', async () => {
  const r = await as(w.db, w.op, tx => tx.query('select id from companies'));
  expect(r.rows).toHaveLength(2);
});

test('일반 관제는 요금표를 못 바꾸고 관리자는 바꾼다', async () => {
  await expectError(as(w.db, w.op, tx => tx.query('insert into fare_bands(max_km, fare) values (10, 20000)')), 'row-level security');
  await as(w.db, w.admin, tx => tx.query('insert into fare_bands(max_km, fare) values (10, 20000)'));
  const r = await as(w.db, w.d, tx => tx.query('select fare from fare_bands'));
  expect(r.rows).toEqual([{ fare: 20000 }]);
});

test('일반 관제는 운영 설정을 못 바꾼다', async () => {
  const r = await as(w.db, w.op, tx => tx.query('update settings set reservation_gap_min = 5'));
  expect(r.affectedRows).toBe(0);
});

test('일반 관제는 업체를 등록할 수 없고 관리자는 할 수 있다', async () => {
  await expectError(as(w.db, w.op, tx => tx.query(`insert into companies(name) values ('새상사')`)), 'row-level security');
  await as(w.db, w.admin, tx => tx.query(`insert into companies(name) values ('새상사')`));
});

test('기사는 자기 role이나 상태를 못 바꾼다', async () => {
  await expectError(as(w.db, w.dp, tx => tx.query(`update profiles set driver_status='active' where id=$1`, [w.dp])), 'FORBIDDEN');
  await expectError(as(w.db, w.d, tx => tx.query(`update profiles set role='staff' where id=$1`, [w.d])), 'FORBIDDEN');
});

test('기사는 자기 이름과 전화는 바꿀 수 있다', async () => {
  await as(w.db, w.d, tx => tx.query(`update profiles set name='새이름', phone='010-9999-9999' where id=$1`, [w.d]));
  const r = await w.db.query('select name, phone from profiles where id=$1', [w.d]);
  expect(r.rows[0]).toEqual({ name: '새이름', phone: '010-9999-9999' });
});

test('관리자는 기사를 승인한다, 일반 관제는 못 한다', async () => {
  const r = await as(w.db, w.op, tx => tx.query(`update profiles set driver_status='active' where id=$1`, [w.dp]));
  expect(r.affectedRows).toBe(0);
  await as(w.db, w.admin, tx => tx.query(`update profiles set driver_status='active' where id=$1`, [w.dp]));
  const s = await w.db.query('select driver_status from profiles where id=$1', [w.dp]);
  expect(s.rows[0]).toEqual({ driver_status: 'active' });
});

test('기사는 다른 기사 프로필을 못 본다', async () => {
  const r = await as(w.db, w.d, tx => tx.query('select id from profiles'));
  expect(r.rows).toEqual([{ id: w.d }]);
});

test('고객 a는 업체 B 주소를 못 본다', async () => {
  await w.db.query(`insert into company_addresses(company_id, address) values ($1, '부산 해운대구')`, [w.B]);
  const r = await as(w.db, w.a, tx => tx.query('select id from company_addresses'));
  expect(r.rows).toHaveLength(0);
});

test('고객은 자기 업체 주소를 등록하고 고정할 수 있다', async () => {
  await as(w.db, w.a, tx => tx.query(`insert into company_addresses(company_id, address, pinned) values ($1, '수원 영통구', true)`, [w.A]));
  await expectError(as(w.db, w.a, tx => tx.query(`insert into company_addresses(company_id, address) values ($1, 'x')`, [w.B])), 'row-level security');
});

test('audit_log는 관리자만 본다', async () => {
  await w.db.query(`insert into audit_log(table_name, action) values ('x', 'UPDATE')`);
  expect((await as(w.db, w.op, tx => tx.query('select id from audit_log'))).rows).toHaveLength(0);
  expect((await as(w.db, w.admin, tx => tx.query('select id from audit_log'))).rows).toHaveLength(1);
});

test('기사는 자기 서류를 올리고 남의 서류는 못 본다', async () => {
  await as(w.db, w.dp, tx => tx.query(`insert into driver_documents(driver_id, kind, path) values ($1, 'license', 'x.jpg')`, [w.dp]));
  expect((await as(w.db, w.d, tx => tx.query('select id from driver_documents'))).rows).toHaveLength(0);
  expect((await as(w.db, w.op, tx => tx.query('select id from driver_documents'))).rows).toHaveLength(1);
});
