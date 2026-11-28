import { as, createWorld, expectError, seedOrder, seedPhotos, SLOTS } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

/** 기사 d에게 배정된 오더. 잡은 지 minutesAgo분 전. */
const held = async (o: Record<string, unknown> = {}, minutesAgo = 0) => {
  const id = await seedOrder(w.db, w.A, { status: 'assigned', driver_id: w.d, ...o });
  await w.db.query(`update orders set assigned_at = now() - make_interval(mins => $2) where id=$1`, [id, minutesAgo]);
  return id;
};
const release = (driver: string, order: string, reason = '차량 위치 착오') =>
  as(w.db, driver, tx => tx.query('select release_order($1, $2)', [order, reason]));
const advance = async (driver: string, order: string) =>
  (await as(w.db, driver, tx => tx.query<{ s: string }>('select advance_order($1) s', [order]))).rows[0]!.s;
const status = async (order: string) =>
  (await w.db.query<{ status: string }>('select status from orders where id=$1', [order])).rows[0]!.status;
const insertPhoto = (driver: string, order: string, phase: string, slot: string | null) =>
  as(w.db, driver, tx => tx.query('insert into order_photos(order_id, phase, slot, path) values ($1, $2, $3, $4)',
    [order, phase, slot, `${order}/${phase}/${slot ?? 'x'}.jpg`]));

describe('반납', () => {
  test('탁송은 잡은 지 9분이면 반납된다', async () => {
    const o = await held({}, 9);
    await release(w.d, o);
    expect(await status(o)).toBe('open');
  });

  test('오더수락(수락함) 뒤에는 시간 안이어도 기사가 반납할 수 없다', async () => {
    const o = await held({ status: 'arrived_pickup' }, 1);
    await expectError(release(w.d, o), 'ACCEPTED_NO_RELEASE');
    expect(await status(o)).toBe('arrived_pickup');
  });

  test('사유 없이도 반납된다', async () => {
    const o = await held({}, 1);
    await as(w.db, w.d, tx => tx.query('select release_order($1, null)', [o]));
    expect(await status(o)).toBe('open');
  });

  test('탁송은 11분이면 RELEASE_WINDOW_PASSED', async () => {
    const o = await held({}, 11);
    await expectError(release(w.d, o), 'RELEASE_WINDOW_PASSED');
  });

  test('대리는 4분이면 되고 6분이면 RELEASE_WINDOW_PASSED', async () => {
    const ok = await held({ kind: 'daeri' }, 4);
    await release(w.d, ok);
    const late = await held({ kind: 'daeri' }, 6);
    await expectError(release(w.d, late), 'RELEASE_WINDOW_PASSED');
  });

  test('반납 시간을 탁송 15분으로 바꾸면 11분에도 반납된다', async () => {
    await w.db.query('update settings set release_min_takson = 15');
    const o = await held({}, 11);
    await release(w.d, o);
  });

  test('반납하면 기사가 비워지고 다시 목록에 나오며 released 이벤트에 사유가 남는다', async () => {
    const o = await held({}, 1);
    await release(w.d, o, '고객 연락 두절');
    expect((await w.db.query('select driver_id, assigned_at from orders where id=$1', [o])).rows[0])
      .toEqual({ driver_id: null, assigned_at: null });
    const listed = await as(w.db, w.d2, tx => tx.query('select id from list_open_orders()'));
    expect(listed.rows).toEqual([{ id: o }]);
    const ev = (await w.db.query(`select actor_id, reason from order_events where order_id=$1 and type='released'`, [o])).rows;
    expect(ev).toEqual([{ actor_id: w.d, reason: '고객 연락 두절' }]);
  });

  test('운행 중에는 반납할 수 없다', async () => {
    const o = await held({ status: 'driving' }, 1);
    await expectError(release(w.d, o), 'INVALID_TRANSITION');
  });

  test('남의 오더는 반납할 수 없다', async () => {
    const o = await held({}, 1);
    await expectError(release(w.d2, o), 'NOT_FOUND');
  });
});

describe('진행 단계와 사진', () => {
  test('출발 사진 4장이면 운행 시작이 PHOTOS_REQUIRED', async () => {
    const o = await held();
    await seedPhotos(w.db, o, 'pickup', ['front', 'back', 'left', 'right']);
    expect(await advance(w.d, o)).toBe('arrived_pickup');
    await expectError(advance(w.d, o), 'PHOTOS_REQUIRED');
  });

  test('출발 5장, 도착 5장이면 completed까지 간다', async () => {
    const o = await held();
    expect(await advance(w.d, o)).toBe('arrived_pickup');
    await seedPhotos(w.db, o, 'pickup');
    expect(await advance(w.d, o)).toBe('driving');
    await expectError(advance(w.d, o), 'PHOTOS_REQUIRED');
    await seedPhotos(w.db, o, 'dropoff');
    expect(await advance(w.d, o)).toBe('completed');
  });

  test('missing_photos는 빠진 칸을 알려 준다', async () => {
    const o = await held();
    await seedPhotos(w.db, o, 'pickup', ['front', 'dashboard']);
    const r = await w.db.query('select missing_photos($1, $2) m', [o, 'pickup']);
    expect(r.rows[0]).toEqual({ m: ['back', 'left', 'right', 'key'] });
  });

  test('완료된 오더에 advance → INVALID_TRANSITION', async () => {
    const o = await held({ status: 'completed' });
    await expectError(advance(w.d, o), 'INVALID_TRANSITION');
  });

  test('남의 오더는 진행할 수 없다', async () => {
    const o = await held();
    await expectError(advance(w.d2, o), 'NOT_FOUND');
  });

  test('배정 기사는 출발 사진을 직접 올리고 5장이면 운행 시작', async () => {
    const o = await held({ status: 'arrived_pickup' });
    for (const s of SLOTS) {
      // 실제 앱처럼 파일을 먼저 올리고 사진 행을 넣는다
      await as(w.db, w.d, tx => tx.query(`insert into storage.objects(bucket_id, name) values ('order-photos', $1)`, [`${o}/pickup/${s}.jpg`]));
      await insertPhoto(w.d, o, 'pickup', s);
    }
    expect(await advance(w.d, o)).toBe('driving');
  });

  test('운행 중에는 출발 사진을 새로 올릴 수 없다', async () => {
    const o = await held({ status: 'driving' });
    await expectError(insertPhoto(w.d, o, 'pickup', 'front'), 'row-level security');
  });

  test('도착 사진은 운행 중에만 올릴 수 있다', async () => {
    const o = await held({ status: 'arrived_pickup' });
    await expectError(insertPhoto(w.d, o, 'dropoff', 'front'), 'row-level security');
  });

  test('추가 사진은 진행 중 아무 때나 올린다', async () => {
    const o = await held({ status: 'driving' });
    await insertPhoto(w.d, o, 'extra', null);
  });

  test('다른 기사는 이 오더에 사진을 못 올린다', async () => {
    const o = await held();
    await expectError(insertPhoto(w.d2, o, 'pickup', 'front'), 'row-level security');
  });

  test('고객은 자기 오더 사진을 보고 다른 업체 고객은 못 본다', async () => {
    const o = await held();
    await seedPhotos(w.db, o, 'pickup');
    expect((await as(w.db, w.a, tx => tx.query('select id from order_photos'))).rows).toHaveLength(6);
    expect((await as(w.db, w.b, tx => tx.query('select id from order_photos'))).rows).toHaveLength(0);
  });

  test('진행하면 status 이벤트에 위치가 남는다', async () => {
    const o = await held();
    await as(w.db, w.d, tx => tx.query('select advance_order($1, 37.2, 127.2)', [o]));
    const ev = (await w.db.query(`select to_status, lat from order_events where order_id=$1 and type='status'`, [o])).rows;
    expect(ev).toContainEqual({ to_status: 'arrived_pickup', lat: 37.2 });
  });
});
