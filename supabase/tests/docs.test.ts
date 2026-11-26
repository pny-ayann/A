import { as, createWorld, expectError, seedCapital, seedDocs, seedOrder, seedPhotos } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

type Cap = { companyId: string; exampleIds: string[] };
type MissingDocs = { missing: string[]; rejected: { slot: string; reason: string }[]; pending: string[]; seal_count: boolean };

/** 기사 d가 오더수락(arrived_pickup)한 서류탁송 오더, 출발 사진 6장 완료 */
const docsOrder = async (cap: Cap, o: Record<string, unknown> = {}) => {
  const id = await seedOrder(w.db, w.A, {
    kind: 'docs', capital_company_id: cap.companyId, status: 'arrived_pickup', driver_id: w.d, ...o,
  });
  await seedPhotos(w.db, id, 'pickup');
  return id;
};
const advance = async (driver: string, order: string) =>
  (await as(w.db, driver, tx => tx.query<{ s: string }>('select advance_order($1) s', [order]))).rows[0]!.s;
const sealCount = (order: string, n: number) =>
  as(w.db, w.d, tx => tx.query('select set_seal_count($1, $2)', [order, n]));
const docId = async (order: string, slot: string) =>
  (await w.db.query<{ id: string }>('select id from order_documents where order_id=$1 and slot=$2', [order, slot])).rows[0]!.id;
const review = (staff: string, id: string, ok: boolean, reason: string | null = null) =>
  as(w.db, staff, tx => tx.query('select review_document($1, $2, $3)', [id, ok, reason]));
const approveAll = async (order: string) => {
  const r = await w.db.query<{ id: string }>('select id from order_documents where order_id=$1', [order]);
  for (const x of r.rows) await review(w.op, x.id, true);
};
const missingDocs = async (order: string) =>
  (await w.db.query<{ m: MissingDocs }>('select missing_documents($1) m', [order])).rows[0]!.m;
const required = async (order: string) =>
  (await w.db.query<{ s: string[] }>('select required_doc_slots($1) s', [order])).rows[0]!.s;
const allSlots = (cap: Cap) => ['registration', 'seal', ...cap.exampleIds];

describe('서류탁송 운행 시작', () => {
  test('서류탁송은 서류 없이 운행 시작하면 SEAL_COUNT_REQUIRED', async () => {
    const o = await docsOrder(await seedCapital(w.db));
    await expectError(advance(w.d, o), 'SEAL_COUNT_REQUIRED');
  });

  test('수량을 넣어도 서류가 빠지면 DOCS_REQUIRED', async () => {
    const cap = await seedCapital(w.db);
    const o = await docsOrder(cap);
    await sealCount(o, 2);
    await seedDocs(w.db, o, ['registration', 'seal']);
    await expectError(advance(w.d, o), 'DOCS_REQUIRED');
    expect((await missingDocs(o)).missing).toEqual(cap.exampleIds);
  });

  test('다 올렸지만 관제 확인 전이면 DOCS_NOT_APPROVED', async () => {
    const cap = await seedCapital(w.db);
    const o = await docsOrder(cap);
    await sealCount(o, 1);
    await seedDocs(w.db, o, allSlots(cap));
    await expectError(advance(w.d, o), 'DOCS_NOT_APPROVED');
    expect((await missingDocs(o)).pending).toEqual(allSlots(cap));
  });

  test('모두 인정되면 driving', async () => {
    const cap = await seedCapital(w.db);
    const o = await docsOrder(cap);
    await sealCount(o, 1);
    await seedDocs(w.db, o, allSlots(cap));
    await approveAll(o);
    expect(await missingDocs(o)).toEqual({ missing: [], rejected: [], pending: [], seal_count: true });
    expect(await advance(w.d, o)).toBe('driving');
  });

  test('인정 뒤 다시 찍으면 pending으로 돌아가 다시 막힌다', async () => {
    const cap = await seedCapital(w.db);
    const o = await docsOrder(cap);
    await sealCount(o, 1);
    await seedDocs(w.db, o, allSlots(cap));
    await approveAll(o);
    await as(w.db, w.d, tx => tx.query(
      `update order_documents set taken_at = now() where order_id=$1 and slot='seal'`, [o]));
    expect((await missingDocs(o)).pending).toEqual(['seal']);
    await expectError(advance(w.d, o), 'DOCS_NOT_APPROVED');
  });

  test('예시가 표지뿐인 회사는 등록증·인감만으로 진행', async () => {
    const cap = await seedCapital(w.db, { pages: 1, cover: true });
    const o = await docsOrder(cap);
    expect(await required(o)).toEqual(['registration', 'seal']);
    await sealCount(o, 1);
    await seedDocs(w.db, o, ['registration', 'seal']);
    await approveAll(o);
    expect(await advance(w.d, o)).toBe('driving');
  });

  test('지운 예시는 더 요구하지 않는다', async () => {
    const cap = await seedCapital(w.db, { pages: 2 });
    const o = await docsOrder(cap);
    await sealCount(o, 1);
    await seedDocs(w.db, o, ['registration', 'seal', cap.exampleIds[0]!]);
    await approveAll(o);
    await w.db.query('delete from capital_examples where id=$1', [cap.exampleIds[1]]);
    expect(await required(o)).toEqual(['registration', 'seal', cap.exampleIds[0]]);
    expect(await advance(w.d, o)).toBe('driving');
  });

  test('일반탁송·대리는 서류 없이 그대로 driving', async () => {
    for (const kind of ['takson', 'daeri']) {
      const o = await seedOrder(w.db, w.A, { kind, status: 'arrived_pickup', driver_id: w.d });
      await seedPhotos(w.db, o, 'pickup');
      expect(await required(o)).toEqual([]);
      expect(await advance(w.d, o)).toBe('driving');
    }
  });

  test('인감 수량은 배정 기사가 오더수락 뒤에만 1 이상으로 적는다', async () => {
    const cap = await seedCapital(w.db);
    const o = await docsOrder(cap);
    await expectError(as(w.db, w.d2, tx => tx.query('select set_seal_count($1, 1)', [o])), 'NOT_FOUND');
    await expectError(sealCount(o, 0), 'SEAL_COUNT_REQUIRED');
    await sealCount(o, 3);
    expect((await w.db.query('select seal_count from orders where id=$1', [o])).rows[0]).toEqual({ seal_count: 3 });
    const early = await seedOrder(w.db, w.A, { kind: 'docs', capital_company_id: cap.companyId, status: 'assigned', driver_id: w.d });
    await expectError(sealCount(early, 1), 'INVALID_TRANSITION');
  });
});

describe('관제 서류 확인', () => {
  test('불인정은 이유가 필요하고 missing_documents.rejected에 이유가 나온다', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['registration', 'seal']);
    const seal = await docId(o, 'seal');
    await expectError(review(w.op, seal, false, ' '), 'REASON_REQUIRED');
    await review(w.op, seal, false, '용도 틀림');
    expect((await missingDocs(o)).rejected).toEqual([{ slot: 'seal', reason: '용도 틀림' }]);
    const ev = (await w.db.query(`select type, reason from order_events where order_id=$1 and type='doc_review'`, [o])).rows;
    expect(ev).toEqual([{ type: 'doc_review', reason: '용도 틀림' }]);
  });

  test('관제만 review_document', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['seal']);
    await expectError(review(w.d, await docId(o, 'seal'), true), 'FORBIDDEN');
  });

  test('기사는 서류를 직접 인정으로 바꿀 수 없다', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['seal']);
    await as(w.db, w.d, tx => tx.query(`update order_documents set status='approved' where order_id=$1`, [o]));
    expect((await missingDocs(o)).pending).toEqual(['seal']);
  });

  test('불인정하면 기사에게 푸시가 쌓인다', async () => {
    await w.db.query(`insert into push_tokens(user_id, token) values ($1, 'T_d')`, [w.d]);
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['seal']);
    await w.db.query('delete from net.http_requests_log');
    await review(w.op, await docId(o, 'seal'), false, '흐림');
    const sent = (await w.db.query<{ body: { to: string }[] }>('select body from net.http_requests_log'))
      .rows.flatMap(r => r.body);
    expect(sent).toEqual([expect.objectContaining({
      to: 'T_d', title: '서류를 다시 찍어 주세요', body: '인감(본인서명사실확인서) — 흐림', data: { orderId: o, screen: 'order' },
    })]);
  });
});

describe('권한과 저장소', () => {
  test('다른 기사·다른 업체 고객은 서류를 못 읽는다', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['seal']);
    const read = async (u: string) =>
      (await as(w.db, u, tx => tx.query('select slot from order_documents where order_id=$1', [o]))).rows;
    expect(await read(w.d)).toHaveLength(1);
    expect(await read(w.a)).toHaveLength(1);
    expect(await read(w.d2)).toHaveLength(0);
    expect(await read(w.b)).toHaveLength(0);
  });

  test('예시 파일은 로그인 사용자 모두 읽고 관리자만 올린다', async () => {
    const put = (u: string, name: string) => as(w.db, u, tx =>
      tx.query(`insert into storage.objects(bucket_id, name, owner) values ('capital-examples', $1, $2)`, [name, u]));
    await put(w.admin, 'c1/1.jpg');
    await expectError(put(w.op, 'c1/2.jpg'), 'row-level security');
    await expectError(put(w.d, 'c1/3.jpg'), 'row-level security');
    const seen = await as(w.db, w.d, tx => tx.query(`select name from storage.objects where bucket_id='capital-examples'`));
    expect(seen.rows).toEqual([{ name: 'c1/1.jpg' }]);
  });

  test('캐피탈 회사·예시 표는 모두 읽고 관리자만 고친다', async () => {
    await as(w.db, w.admin, tx => tx.query(`insert into capital_companies(name) values ('BNK리스')`));
    await expectError(as(w.db, w.op, tx => tx.query(`insert into capital_companies(name) values ('X')`)), 'row-level security');
    const r = await as(w.db, w.d, tx => tx.query('select name from capital_companies'));
    expect(r.rows).toEqual([{ name: 'BNK리스' }]);
  });

  test('기사는 오더수락 뒤에만 docs 폴더에 올린다', async () => {
    const cap = await seedCapital(w.db, { pages: 0 });
    const put = (o: string) => as(w.db, w.d, tx =>
      tx.query(`insert into storage.objects(bucket_id, name, owner) values ('order-photos', $1, $2)`, [`${o}/docs/seal.jpg`, w.d]));
    await put(await docsOrder(cap));
    const early = await seedOrder(w.db, w.A, { kind: 'docs', capital_company_id: cap.companyId, status: 'assigned', driver_id: w.d });
    await expectError(put(early), 'row-level security');
  });
});

describe('접수와 목록', () => {
  test('서류탁송인데 캐피탈 회사 없으면 CAPITAL_REQUIRED', async () => {
    const r = as(w.db, w.a, tx => tx.query('select create_order($1, $2, $3)', [
      JSON.stringify({ company_id: w.A, kind: 'docs', pickup_address: '가', dropoff_address: '나', payment_method: 'postpaid', fare: 1000 }),
      '[]', [],
    ]));
    await expectError(r, 'CAPITAL_REQUIRED');
  });

  test('create_order가 캐피탈 회사를 저장한다', async () => {
    const cap = await seedCapital(w.db, { pages: 0 });
    const r = await as(w.db, w.a, tx => tx.query<{ id: string }>('select create_order($1, $2, $3) id', [
      JSON.stringify({ company_id: w.A, kind: 'docs', capital_company_id: cap.companyId,
        pickup_address: '가', dropoff_address: '나', payment_method: 'postpaid', fare: 1000 }),
      '[]', [],
    ]));
    const row = (await w.db.query('select kind, capital_company_id from orders where id=$1', [r.rows[0]!.id])).rows[0];
    expect(row).toEqual({ kind: 'docs', capital_company_id: cap.companyId });
  });

  test('일반탁송에 회사를 넣어도 비운다', async () => {
    const cap = await seedCapital(w.db, { pages: 0 });
    const o = await seedOrder(w.db, w.A, { kind: 'takson', capital_company_id: cap.companyId });
    expect((await w.db.query('select capital_company_id from orders where id=$1', [o])).rows[0])
      .toEqual({ capital_company_id: null });
  });

  test('list_open_orders에 capital_name이 나온다', async () => {
    const cap = await seedCapital(w.db, { name: 'KB할부', pages: 0 });
    await seedOrder(w.db, w.A, { kind: 'docs', capital_company_id: cap.companyId });
    const r = await as(w.db, w.d, tx => tx.query('select kind, capital_name from list_open_orders()'));
    expect(r.rows).toEqual([{ kind: 'docs', capital_name: 'KB할부' }]);
  });
});

describe('차량 사진 불인정', () => {
  const photoId = async (o: string, slot: string) =>
    (await w.db.query<{ id: string }>(`select id from order_photos where order_id=$1 and phase='pickup' and slot=$2`, [o, slot]))
      .rows[0]!.id;
  const missingPhotos = async (o: string) =>
    (await w.db.query<{ m: string[] }>(`select missing_photos($1, 'pickup') m`, [o])).rows[0]!.m;
  const reject = (u: string, id: string, reason: string) =>
    as(w.db, u, tx => tx.query('select reject_photo($1, $2)', [id, reason]));

  test('차량 사진 불인정하면 missing_photos에 다시 나오고, 다시 올리면 사라진다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
    await seedPhotos(w.db, o, 'pickup');
    const front = await photoId(o, 'front');
    await expectError(reject(w.op, front, ''), 'REASON_REQUIRED');
    await reject(w.op, front, '잘림');
    expect(await missingPhotos(o)).toEqual(['front']);
    await as(w.db, w.d, tx => tx.query('update order_photos set taken_at = now() where id=$1', [front]));
    expect(await missingPhotos(o)).toEqual([]);
  });

  test('관제만 reject_photo', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d });
    await seedPhotos(w.db, o, 'pickup');
    await expectError(reject(w.d, await photoId(o, 'front'), '잘림'), 'FORBIDDEN');
  });

  test('운행 중에는 출발 사진을 불인정할 수 없다', async () => {
    const o = await seedOrder(w.db, w.A, { status: 'driving', driver_id: w.d });
    await seedPhotos(w.db, o, 'pickup');
    await expectError(reject(w.op, await photoId(o, 'front'), '잘림'), 'INVALID_TRANSITION');
  });
});

describe('검토 수정', () => {
  const takenAt = async (id: string) =>
    (await w.db.query<{ t: string }>('select taken_at::text t from order_documents where id=$1', [id])).rows[0]!.t;

  test('관제가 본 뒤 기사가 다시 찍었으면 인정이 거절된다 (DOC_CHANGED)', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['seal']);
    const id = await docId(o, 'seal');
    const seen = await takenAt(id);
    await as(w.db, w.d, tx => tx.query(`update order_documents set taken_at = now() + interval '1 minute' where id=$1`, [id]));
    await expectError(as(w.db, w.op, tx => tx.query('select review_document($1, true, null, $2)', [id, seen])), 'DOC_CHANGED');
    const now2 = await takenAt(id);
    await as(w.db, w.op, tx => tx.query('select review_document($1, true, null, $2)', [id, now2]));
    expect((await missingDocs(o)).pending).toEqual([]);
  });

  test('인감 수량을 바꾸면 인감 서류가 다시 확인 대기', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await sealCount(o, 2);
    await seedDocs(w.db, o, ['registration', 'seal']);
    await approveAll(o);
    await sealCount(o, 2);
    expect((await missingDocs(o)).pending).toEqual([]);
    await sealCount(o, 1);
    expect((await missingDocs(o)).pending).toEqual(['seal']);
  });

  test('운행 중에는 서류를 불인정할 수 없다', async () => {
    const o = await docsOrder(await seedCapital(w.db, { pages: 0 }));
    await seedDocs(w.db, o, ['seal']);
    await w.db.query(`update orders set status='driving' where id=$1`, [o]);
    await expectError(review(w.op, await docId(o, 'seal'), false, '흐림'), 'INVALID_TRANSITION');
  });
});
