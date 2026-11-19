import { as, createWorld, expectError, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const claim = (driver: string, order: string, lat: number | null = null, lng: number | null = null) =>
  as(w.db, driver, tx => tx.query('select claim_order($1, $2, $3)', [order, lat, lng]));
const list = (driver: string, lat: number | null = null, lng: number | null = null) =>
  as(w.db, driver, tx => tx.query<Record<string, unknown>>('select * from list_open_orders($1, $2)', [lat, lng]));

/** 내일 14:00 기준 + 분 */
const tomorrowAt = (minutes: number) => {
  const t = new Date(Date.now() + 24 * 3600 * 1000);
  t.setHours(14, 0, 0, 0);
  return new Date(t.getTime() + minutes * 60000).toISOString();
};
const fromNow = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();

describe('공개 목록', () => {
  test('연락처와 전체 주소 컬럼이 없다', async () => {
    await seedOrder(w.db, w.A);
    const r = await list(w.d, 37.5665, 126.978);
    expect(Object.keys(r.rows[0]!).sort()).toEqual(
      ['distance_km', 'dropoff_area', 'fare', 'id', 'kind', 'mission_names', 'order_no', 'payment_method', 'pickup_area', 'reserved_at']);
  });

  test('출발지와 같은 위치면 0km, 위치를 안 주면 null', async () => {
    await seedOrder(w.db, w.A);
    expect((await list(w.d, 37.5665, 126.978)).rows[0]!.distance_km).toBeCloseTo(0, 1);
    expect((await list(w.d)).rows[0]!.distance_km).toBeNull();
  });

  test('서울시청에서 강남역까지 약 9km', async () => {
    await seedOrder(w.db, w.A, { pickup_lat: 37.4979, pickup_lng: 127.0276 });
    const km = (await list(w.d, 37.5665, 126.978)).rows[0]!.distance_km as number;
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(10);
  });

  test('일반 오더는 가까운 순, 예약은 그 뒤에 시간 순', async () => {
    const far = await seedOrder(w.db, w.A, { pickup_lat: 37.4979, pickup_lng: 127.0276 });
    const near = await seedOrder(w.db, w.A);
    const r2 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(60) });
    const r1 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(0) });
    const ids = (await list(w.d, 37.5665, 126.978)).rows.map(r => r.id);
    expect(ids).toEqual([near, far, r1, r2]);
  });

  test('미션 이름이 함께 나온다', async () => {
    const o = await seedOrder(w.db, w.A);
    const m = (await w.db.query<{ id: string }>(`insert into missions(name, extra_fare) values ('세차', 10000) returning id`)).rows[0]!.id;
    await w.db.query('insert into order_missions(order_id, mission_id, extra_fare) values ($1, $2, 10000)', [o, m]);
    expect((await list(w.d)).rows[0]!.mission_names).toEqual(['세차']);
  });

  test('관제 배차 전용 오더는 목록에 없고 잡을 수도 없다', async () => {
    const o = await seedOrder(w.db, w.A, { dispatch_mode: 'staff_only' });
    expect((await list(w.d)).rows).toHaveLength(0);
    await expectError(claim(w.d, o), 'NOT_OPEN');
  });

  test('배차된 오더와 취소된 오더는 목록에 없다', async () => {
    await seedOrder(w.db, w.A, { status: 'cancelled' });
    await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d2 });
    expect((await list(w.d)).rows).toHaveLength(0);
  });

  test('대기 중 기사는 목록이 비고 잡기는 DRIVER_NOT_ACTIVE', async () => {
    const o = await seedOrder(w.db, w.A);
    expect((await list(w.dp)).rows).toHaveLength(0);
    await expectError(claim(w.dp, o), 'DRIVER_NOT_ACTIVE');
  });

  test('고객은 목록이 비고 잡을 수 없다', async () => {
    const o = await seedOrder(w.db, w.A);
    expect((await list(w.a)).rows).toHaveLength(0);
    await expectError(claim(w.a, o), 'DRIVER_NOT_ACTIVE');
  });
});

describe('잡기', () => {
  test('잡으면 배정되고 기사가 오더 전체를 볼 수 있다', async () => {
    const o = await seedOrder(w.db, w.A);
    await claim(w.d, o);
    const r = await as(w.db, w.d, tx => tx.query('select status, driver_id, pickup_contact_phone from orders where id=$1', [o]));
    expect(r.rows[0]).toEqual({ status: 'assigned', driver_id: w.d, pickup_contact_phone: '010-1111-1111' });
  });

  test('이미 배차된 오더를 두 번째 기사가 잡으면 ALREADY_TAKEN', async () => {
    const o = await seedOrder(w.db, w.A);
    await claim(w.d, o);
    await expectError(claim(w.d2, o), 'ALREADY_TAKEN');
  });

  test('없는 오더는 NOT_OPEN', async () => {
    await expectError(claim(w.d, '00000000-0000-0000-0000-000000000000'), 'NOT_OPEN');
  });

  test('잡으면 status 이벤트에 기사 위치가 남는다', async () => {
    const o = await seedOrder(w.db, w.A);
    await claim(w.d, o, 37.1, 127.1);
    const ev = (await w.db.query(`select actor_id, to_status, lat, lng from order_events where order_id=$1 and type='status'`, [o])).rows;
    expect(ev).toEqual([{ actor_id: w.d, to_status: 'assigned', lat: 37.1, lng: 127.1 }]);
  });
});

describe('동시 보유 제한', () => {
  test('일반 오더를 진행 중이면 다른 일반 오더는 HAS_ACTIVE_ORDER', async () => {
    const o1 = await seedOrder(w.db, w.A);
    const o2 = await seedOrder(w.db, w.A);
    await claim(w.d, o1);
    await expectError(claim(w.d, o2), 'HAS_ACTIVE_ORDER');
  });

  test('일반 오더를 끝내면 다음 일반 오더를 잡는다', async () => {
    const o1 = await seedOrder(w.db, w.A);
    const o2 = await seedOrder(w.db, w.A);
    await claim(w.d, o1);
    await w.db.query(`update orders set status='completed' where id=$1`, [o1]);
    await claim(w.d, o2);
  });

  test('예약 14:00을 잡은 기사는 14:20 예약을 못 잡고 14:30 예약은 잡는다', async () => {
    const r1400 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(0) });
    const r1420 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(20) });
    const r1430 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(30) });
    await claim(w.d, r1400);
    await expectError(claim(w.d, r1420), 'RESERVATION_CONFLICT');
    await claim(w.d, r1430);
  });

  test('예약을 잡고 있어도 일반 오더 1건은 잡는다', async () => {
    const r = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(0) });
    const o = await seedOrder(w.db, w.A);
    await claim(w.d, r);
    await claim(w.d, o);
  });

  test('20분 뒤 예약을 잡고 있으면 일반 오더는 RESERVATION_CONFLICT', async () => {
    const r = await seedOrder(w.db, w.A, { reserved_at: fromNow(20) });
    const o = await seedOrder(w.db, w.A);
    await claim(w.d, r);
    await expectError(claim(w.d, o), 'RESERVATION_CONFLICT');
  });

  test('일반 오더 진행 중이면 20분 뒤 예약은 못 잡고 2시간 뒤 예약은 잡는다', async () => {
    const o = await seedOrder(w.db, w.A);
    const soon = await seedOrder(w.db, w.A, { reserved_at: fromNow(20) });
    const later = await seedOrder(w.db, w.A, { reserved_at: fromNow(120) });
    await claim(w.d, o);
    await expectError(claim(w.d, soon), 'RESERVATION_CONFLICT');
    await claim(w.d, later);
  });

  test('예약 간격 설정을 10분으로 바꾸면 14:20 예약도 잡힌다', async () => {
    await w.db.query('update settings set reservation_gap_min = 10');
    const r1400 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(0) });
    const r1420 = await seedOrder(w.db, w.A, { reserved_at: tomorrowAt(20) });
    await claim(w.d, r1400);
    await claim(w.d, r1420);
  });

  test('driver_conflicts는 자기 자신 오더를 제외할 수 있다', async () => {
    const o = await seedOrder(w.db, w.A);
    await claim(w.d, o);
    const r = await w.db.query('select driver_conflicts($1, null, $2) c', [w.d, o]);
    expect(r.rows[0]).toEqual({ c: [] });
  });
});

test('driver_conflicts는 코드 배열을 정확히 돌려준다', async () => {
  const o = await seedOrder(w.db, w.A);
  const r = await seedOrder(w.db, w.A, { reserved_at: new Date(Date.now() + 10 * 60000).toISOString() });
  await claim(w.d, r);
  await w.db.query(`update orders set status='assigned', driver_id=$2 where id=$1`, [o, w.d]);
  const c = await w.db.query('select driver_conflicts($1, null) c', [w.d]);
  expect(c.rows[0]).toEqual({ c: ['HAS_ACTIVE_ORDER', 'RESERVATION_CONFLICT'] });
});
