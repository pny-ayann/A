import { as, createWorld, expectError } from './helpers/db';

// 고객 오더 접수를 한 번에 저장 (오더 + 경유지 + 미션이 모두 들어가거나 아무것도 안 들어간다)
let w: Awaited<ReturnType<typeof createWorld>>;
let wash: string;
let off: string;
beforeEach(async () => {
  w = await createWorld();
  wash = (await w.db.query<{ id: string }>(`insert into missions(name, extra_fare) values ('세차', 10000) returning id`)).rows[0]!.id;
  off = (await w.db.query<{ id: string }>(`insert into missions(name, extra_fare, active) values ('꺼진 미션', 5000, false) returning id`)).rows[0]!.id;
  await w.db.query(`insert into push_tokens(user_id, token) values ($1, 'T_d')`, [w.d]);
});

const order = (company: string) => ({
  company_id: company, kind: 'takson', dispatch_mode: 'open', reserved_at: null,
  pickup_address: '서울 중구 세종대로 1', pickup_area: '중구 태평로1가', pickup_lat: 37.56, pickup_lng: 126.97,
  dropoff_address: '서울 강남구 테헤란로 152', dropoff_area: '강남구 역삼동', dropoff_lat: 37.5, dropoff_lng: 127.03,
  vehicle_number: '12가3456', payment_method: 'postpaid', fare: 45000, distance_km: 11.4,
});
const wp = (address: string | null) => ({ address, detail: null, area: '수원시', lat: 37.2, lng: 127.0, contact_name: null, contact_phone: null });
const create = (user: string, o: unknown, wps: unknown[], missions: string[]) =>
  as(w.db, user, tx => tx.query<{ id: string }>('select create_order($1::jsonb, $2::jsonb, $3::uuid[]) as id', [JSON.stringify(o), JSON.stringify(wps), missions]));
const count = async (t: string) => Number((await w.db.query<{ n: string }>(`select count(*) n from ${t}`)).rows[0]!.n);
const newOrderPushes = async () =>
  (await w.db.query<{ body: { title: string }[] }>('select body from net.http_requests_log')).rows.flatMap(r => r.body).filter(m => m.title === '새 오더');

test('오더·경유지(순서대로)·미션(서버 요금)을 한 번에 넣고 오더 id를 준다', async () => {
  const r = await create(w.a, order(w.A), [wp('수원'), wp('화성')], [wash]);
  const id = r.rows[0]!.id;
  expect((await w.db.query('select company_id, fare, status, created_by from orders where id = $1', [id])).rows[0])
    .toEqual({ company_id: w.A, fare: 45000, status: 'open', created_by: w.a });
  expect((await w.db.query('select seq, address from order_waypoints where order_id = $1 order by seq', [id])).rows)
    .toEqual([{ seq: 1, address: '수원' }, { seq: 2, address: '화성' }]);
  expect((await w.db.query('select mission_id, extra_fare from order_missions where order_id = $1', [id])).rows)
    .toEqual([{ mission_id: wash, extra_fare: 10000 }]);
  expect(await newOrderPushes()).toHaveLength(1);
});

test('꺼진 미션이 있으면 아무것도 저장하지 않고 기사 알림도 없다', async () => {
  await expectError(create(w.a, order(w.A), [wp('수원')], [wash, off]), 'INVALID_MISSION');
  expect(await count('orders')).toBe(0);
  expect(await count('order_waypoints')).toBe(0);
  expect(await newOrderPushes()).toEqual([]);
});

test('경유지 저장이 실패하면 오더도 남지 않는다', async () => {
  await expect(create(w.a, order(w.A), [wp(null)], [])).rejects.toThrow();
  expect(await count('orders')).toBe(0);
});

test('다른 업체 이름으로는 접수할 수 없다', async () => {
  await expect(create(w.b, order(w.A), [], [])).rejects.toThrow();
  expect(await count('orders')).toBe(0);
});

test('고객은 상태·기사·관제 전용을 정할 수 없다 (넣어도 무시하거나 거절)', async () => {
  await expect(create(w.a, { ...order(w.A), status: 'assigned', driver_id: w.d }, [], [])).resolves.toBeDefined();
  expect((await w.db.query('select status, driver_id from orders')).rows).toEqual([{ status: 'open', driver_id: null }]);
  await expect(create(w.a, { ...order(w.A), dispatch_mode: 'staff_only' }, [], [])).rejects.toThrow();
});

test('로그인 안 한 사람은 부를 수 없다', async () => {
  await expectError(w.db.transaction(async tx => {
    await tx.exec('set local role anon');
    await tx.query(`select create_order('{}'::jsonb, '[]'::jsonb, '{}'::uuid[])`);
  }), 'permission denied');
});

test('관제도 한 번에 접수한다: 아무 업체, 관제 전용, 경유지·미션 포함 (반쪽 오더 없음)', async () => {
  const r = await create(w.op, { ...order(w.B), dispatch_mode: 'staff_only' }, [wp('수원')], [wash]);
  const id = r.rows[0]!.id;
  expect((await w.db.query('select company_id, dispatch_mode from orders where id = $1', [id])).rows[0])
    .toEqual({ company_id: w.B, dispatch_mode: 'staff_only' });
  expect(await count('order_waypoints')).toBe(1);
  expect(await count('order_missions')).toBe(1);
  await expect(create(w.op, order(w.A), [wp(null)], [])).rejects.toThrow();
  expect(await count('orders')).toBe(1);
});
