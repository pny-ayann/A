import { as, createWorld, expectError, seedCompany, createUser, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const addReceipt = (driver: string, order: string, amount = 30000) =>
  as(w.db, driver, tx => tx.query('insert into fuel_receipts(order_id, amount, path) values ($1, $2, $3)', [order, amount, `${order}/r.jpg`]));
const send = (user: string, order: string, thread: string, body: string) =>
  as(w.db, user, tx => tx.query('insert into messages(order_id, thread, body) values ($1, $2, $3)', [order, thread, body]));
const read = (user: string, sql: string, params: unknown[] = []) =>
  as(w.db, user, tx => tx.query<Record<string, unknown>>(sql, params));

describe('주유 영수증', () => {
  test('운행 중 배정 기사는 영수증을 올린다, 배정 전에는 못 올린다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await addReceipt(w.d, o);
    const open = await seedOrder(w.db, w.A);
    await expectError(addReceipt(w.d, open), 'row-level security');
  });

  test('금액은 0보다 커야 한다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await expectError(addReceipt(w.d, o, 0), 'check');
  });

  test('고객 청구 업체의 고객은 보고, 회사 부담 업체의 고객은 못 본다', async () => {
    const C = await seedCompany(w.db, { fuelBilling: 'company' });
    const c = await createUser(w.db, { loginId: 'cust_c', role: 'customer', companyId: C });
    const oa = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    const oc = await seedOrder(w.db, C, { status: 'driving', driver_id: w.d2 });
    await addReceipt(w.d, oa);
    await addReceipt(w.d2, oc);
    expect((await read(w.a, 'select id from fuel_receipts')).rows).toHaveLength(1);
    expect((await read(c, 'select id from fuel_receipts')).rows).toHaveLength(0);
    expect((await read(w.op, 'select id from fuel_receipts')).rows).toHaveLength(2);
  });
});

describe('문의', () => {
  test('기사는 고객 스레드 메시지를 못 보고 못 쓴다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await send(w.a, o, 'customer', '언제 오나요?');
    expect((await read(w.d, 'select id from messages')).rows).toHaveLength(0);
    await expectError(send(w.d, o, 'customer', 'x'), 'row-level security');
    await send(w.d, o, 'driver', '고객이 전화를 안 받아요');
    expect((await read(w.a, 'select body from messages')).rows).toEqual([{ body: '언제 오나요?' }]);
  });

  test('고객 a는 업체 B 오더의 메시지를 못 보고 못 쓴다', async () => {
    const ob = await seedOrder(w.db, w.B);
    await send(w.b, ob, 'customer', '문의');
    expect((await read(w.a, 'select id from messages')).rows).toHaveLength(0);
    await expectError(send(w.a, ob, 'customer', 'x'), 'row-level security');
  });

  test('관제는 두 스레드 모두 보고 답한다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await send(w.a, o, 'customer', '고객 문의');
    await send(w.d, o, 'driver', '기사 문의');
    await send(w.op, o, 'customer', '관제 답변');
    expect((await read(w.op, 'select id from messages')).rows).toHaveLength(3);
  });

  test('보낸 사람은 위조할 수 없다', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(read(w.a, `insert into messages(order_id, thread, body, sender_id) values ($1,'customer','x',$2)`, [o, w.op]), 'row-level security');
  });

  test('읽음 처리 전에는 남이 쓴 2개, 읽고 나면 0개', async () => {
    const o = await seedOrder(w.db, w.A);
    await send(w.op, o, 'customer', '1');
    await send(w.op, o, 'customer', '2');
    await send(w.a, o, 'customer', '내가 쓴 것');
    expect((await read(w.a, 'select * from unread_counts()')).rows).toEqual([{ order_id: o, thread: 'customer', unread: 2 }]);
    await read(w.a, `insert into thread_reads(order_id, thread) values ($1, 'customer')
      on conflict (order_id, thread, user_id) do update set read_at = now()`, [o]);
    expect((await read(w.a, 'select * from unread_counts()')).rows).toEqual([]);
  });

  test('관제의 안 읽은 개수는 고객과 기사 스레드를 따로 센다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d });
    await send(w.a, o, 'customer', '고객');
    await send(w.d, o, 'driver', '기사');
    const r = (await read(w.op, 'select * from unread_counts() order by thread')).rows;
    expect(r).toEqual([{ order_id: o, thread: 'customer', unread: 1 }, { order_id: o, thread: 'driver', unread: 1 }]);
  });
});

describe('기사 위치', () => {
  test('고객은 운행 중인 자기 오더 기사 위치만 보고, 완료 후에는 못 본다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await read(w.d, 'select report_location(37.3, 127.3)');
    await read(w.d2, 'select report_location(37.4, 127.4)');
    expect((await read(w.a, 'select driver_id, lat from driver_locations')).rows).toEqual([{ driver_id: w.d, lat: 37.3 }]);
    expect((await read(w.b, 'select driver_id from driver_locations')).rows).toHaveLength(0);
    await w.db.query(`update orders set status='completed' where id=$1`, [o]);
    expect((await read(w.a, 'select driver_id from driver_locations')).rows).toHaveLength(0);
  });

  test('기사는 남의 위치를 쓸 수 없다', async () => {
    await expectError(read(w.d, 'insert into driver_locations(driver_id, lat, lng) values ($1, 1, 1)', [w.d2]), 'row-level security');
  });

  test('잡을 때와 진행할 때 넘긴 위치가 driver_locations에 들어간다', async () => {
    const o = await seedOrder(w.db, w.A);
    await read(w.d, 'select claim_order($1, 37.5, 127.5)', [o]);
    expect((await w.db.query('select lat from driver_locations where driver_id=$1', [w.d])).rows).toEqual([{ lat: 37.5 }]);
    await read(w.d, 'select advance_order($1, 37.6, 127.6)', [o]);
    expect((await w.db.query('select lat from driver_locations where driver_id=$1', [w.d])).rows).toEqual([{ lat: 37.6 }]);
  });

  test('후보 기사는 출발지에서 가까운 순이고 진행 건수와 충돌 경고가 있다', async () => {
    await read(w.d, 'select report_location(37.4979, 127.0276)'); // 강남역, 약 9km
    await read(w.d2, 'select report_location(37.5665, 126.978)'); // 출발지와 같은 곳
    await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d2 });
    const o = await seedOrder(w.db, w.A);
    const r = (await read(w.op, 'select driver_id, active_count, conflicts from staff_driver_candidates($1)', [o])).rows;
    expect(r).toEqual([
      { driver_id: w.d2, active_count: 1, conflicts: ['HAS_ACTIVE_ORDER'] },
      { driver_id: w.d, active_count: 0, conflicts: [] },
    ]);
  });

  test('후보 기사 목록은 관제만', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(read(w.a, 'select * from staff_driver_candidates($1)', [o]), 'FORBIDDEN');
  });
});

describe('푸시 토큰', () => {
  test('본인 토큰만 보고 쓴다', async () => {
    await read(w.d, `insert into push_tokens(token) values ('ExponentPushToken[a]')`);
    await read(w.d2, `insert into push_tokens(token) values ('ExponentPushToken[b]')`);
    expect((await read(w.d, 'select token from push_tokens')).rows).toEqual([{ token: 'ExponentPushToken[a]' }]);
  });
});
