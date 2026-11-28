import { as, createWorld, expectError, seedDocs, seedOrder, seedPhotos } from './helpers/db';

// 2026-11-28 점검에서 나온 돈·운행 구멍 막기 (0029)
let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const count = async (sql: string, args: unknown[]) =>
  Number((await w.db.query<{ n: number }>(sql, args)).rows[0]!.n);

describe('요금', () => {
  test('배정 뒤 고객 변경 요청으로 요금을 낮출 수 없다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 50000 });
    await expectError(as(w.db, w.a, tx => tx.query(
      `select customer_amend_order($1,'dropoff_change',0,'{"address":"부산 해운대구","area":"해운대구 우동"}'::jsonb)`, [o])), 'FARE_DECREASE');
  });

  test('요금은 100만 원을 넘을 수 없다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 50000 });
    await expect(as(w.db, w.a, tx => tx.query(
      `select customer_amend_order($1,'dropoff_change',1000001,'{"address":"부산 해운대구","area":"해운대구 우동"}'::jsonb)`, [o])))
      .rejects.toThrow(/orders_fare_max/);
  });

  test('요금을 올리는 변경은 그대로 된다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d, fare: 50000 });
    await as(w.db, w.a, tx => tx.query(
      `select customer_amend_order($1,'dropoff_change',60000,'{"address":"부산 해운대구","area":"해운대구 우동"}'::jsonb)`, [o]));
    expect(await count('select fare as n from orders where id = $1', [o])).toBe(60000);
  });
});

test('돈 기록이 있는 기사는 지울 수 없다', async () => {
  await w.db.query(`insert into wallet_entries(driver_id, amount, kind, label) values ($1, 10000, 'topup', '충전')`, [w.d]);
  await expect(w.db.query('delete from profiles where id = $1', [w.d])).rejects.toThrow(/foreign key/);
  expect(await count('select count(*)::int as n from wallet_entries where driver_id = $1', [w.d])).toBe(1);
});

describe('주유 영수증', () => {
  test('관제도 오더 기사가 아닌 사람 앞으로는 못 넣는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await expectError(as(w.db, w.op, tx => tx.query(
      `insert into fuel_receipts(order_id, driver_id, amount, path) values ($1, $2, 10000, 'x.jpg')`, [o, w.d2])), 'RECEIPT_DRIVER');
  });

  test('한 장에 50만 원을 넘을 수 없다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await expect(as(w.db, w.d, tx => tx.query(
      `insert into fuel_receipts(order_id, driver_id, amount, path) values ($1, $2, 900000, 'x.jpg')`, [o, w.d])))
      .rejects.toThrow(/fuel_receipts_amount_max/);
  });
});

test('관제가 회수하면 앞 기사가 찍은 출발 사진과 서류가 지워진다', async () => {
  const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d, assigned_at: new Date().toISOString() });
  await seedPhotos(w.db, o, 'pickup');
  await seedDocs(w.db, o, ['registration']);
  await as(w.db, w.op, tx => tx.query(`select staff_unassign($1, '연락 안 됨')`, [o]));
  expect(await count('select count(*)::int as n from order_photos where order_id = $1', [o])).toBe(0);
  expect(await count('select count(*)::int as n from order_documents where order_id = $1', [o])).toBe(0);
});

test('시작 잔액은 기사마다 한 번만', async () => {
  await w.db.query(`insert into wallet_entries(driver_id, amount, kind, label) values ($1, 1000, 'opening', '시작 잔액')`, [w.d]);
  await expect(w.db.query(`insert into wallet_entries(driver_id, amount, kind, label) values ($1, 1000, 'opening', '시작 잔액')`, [w.d]))
    .rejects.toThrow(/wallet_entries_one_opening/);
});

test('가입 대기 기사는 남의 푸시 토큰을 빼앗을 수 없다', async () => {
  await as(w.db, w.d, tx => tx.query(`select claim_push_token('T_shared')`));
  await expectError(as(w.db, w.dp, tx => tx.query(`select claim_push_token('T_shared')`)), 'TOKEN_IN_USE');
  expect(await count(`select count(*)::int as n from push_tokens where token = 'T_shared' and user_id = $1`, [w.d])).toBe(1);
});

test('사진 버킷은 jpg 5MB까지만', async () => {
  const r = await w.db.query<{ id: string; file_size_limit: number; allowed_mime_types: string[] }>(
    `select id, file_size_limit, allowed_mime_types from storage.buckets where id in ('order-photos', 'receipts', 'driver-docs') order by id`);
  expect(r.rows).toHaveLength(3);
  for (const b of r.rows) expect([b.id, Number(b.file_size_limit), b.allowed_mime_types]).toEqual([b.id, 5242880, ['image/jpeg']]);
});

test('접근 규칙의 내 정보 함수는 줄마다가 아니라 한 번만 계산한다 (select로 감싸기)', async () => {
  const r = await w.db.query<{ p: string; q: string | null; c: string | null }>(
    `select policyname p, qual q, with_check c from pg_policies where schemaname in ('public', 'storage')`);
  const bare = r.rows.flatMap(x => [x.q, x.c].filter(Boolean).map(s => ({ p: x.p, s: s! })))
    .filter(({ s }) => /(?<!SELECT (public\.)?|SELECT )\b(is_admin|is_staff|my_company_id|my_role|auth\.uid)\(\)/.test(s));
  expect(bare).toEqual([]);
});
