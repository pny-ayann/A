import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const wp = (address: string) => ({ address, detail: null, area: '중구', lat: 37.5, lng: 127, contact_name: null, contact_phone: null });
const extras = (user: string, order: string, waypoints: unknown, missionIds: string[] | null) =>
  as(w.db, user, tx => tx.query('select staff_set_order_extras($1, $2, $3)',
    [order, waypoints === null ? null : JSON.stringify(waypoints), missionIds]));
const mission = async (name: string, fare: number, active = true) =>
  (await w.db.query<{ id: string }>('insert into missions(name, extra_fare, active) values ($1, $2, $3) returning id',
    [name, fare, active])).rows[0]!.id;

describe('관제 경유지·미션 수정', () => {
  test('완료된 오더도 경유지를 통째로 바꾸고 이력에 남는다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'completed', driver_id: w.d });
    await w.db.query(`insert into order_waypoints(order_id, seq, address) values ($1, 1, '옛 경유지')`, [o]);
    await extras(w.op, o, [wp('새 경유지1'), wp('새 경유지2')], null);
    const r = await w.db.query<{ seq: number; address: string }>('select seq, address from order_waypoints where order_id=$1 order by seq', [o]);
    expect(r.rows).toEqual([{ seq: 1, address: '새 경유지1' }, { seq: 2, address: '새 경유지2' }]);
    const e = await w.db.query<{ data: unknown }>(`select data from order_events where order_id=$1 and type='edit'`, [o]);
    expect(e.rows.map(x => x.data)).toContainEqual(['waypoints']);
  });

  test('미션을 바꾸면 이미 붙은 미션 요금은 그대로, 새 미션은 지금 요금', async () => {
    const old = await mission('세차', 5000);
    const add = await mission('주유', 3000);
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await w.db.query('insert into order_missions(order_id, mission_id, extra_fare) values ($1, $2, 4000)', [o, old]);
    await extras(w.op, o, null, [old, add]);
    const r = await w.db.query<{ mission_id: string; extra_fare: number }>('select mission_id, extra_fare from order_missions where order_id=$1', [o]);
    expect(Object.fromEntries(r.rows.map(x => [x.mission_id, x.extra_fare]))).toEqual({ [old]: 4000, [add]: 3000 });
    await extras(w.op, o, null, []);
    expect((await w.db.query('select 1 from order_missions where order_id=$1', [o])).rows).toHaveLength(0);
  });

  test('null이면 그 부분은 건드리지 않는다', async () => {
    const o = await seedOrder(w.db, w.A);
    await w.db.query(`insert into order_waypoints(order_id, seq, address) values ($1, 1, '그대로')`, [o]);
    await extras(w.op, o, null, []);
    expect((await w.db.query('select 1 from order_waypoints where order_id=$1', [o])).rows).toHaveLength(1);
  });

  test('쓰지 않는 미션을 새로 붙일 수 없다', async () => {
    const off = await mission('옛 미션', 1000, false);
    const o = await seedOrder(w.db, w.A);
    await expectError(extras(w.op, o, null, [off]), 'INVALID_MISSION');
  });

  test('관제만 쓸 수 있다', async () => {
    const o = await seedOrder(w.db, w.A);
    await expectError(extras(w.a, o, [wp('x')], null), 'FORBIDDEN');
    await expectError(extras(w.d, o, [wp('x')], null), 'FORBIDDEN');
  });
});
