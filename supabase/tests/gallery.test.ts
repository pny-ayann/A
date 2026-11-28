import { as, createWorld, seedCapital, seedOrder } from './helpers/db';

let w: Awaited<ReturnType<typeof createWorld>>;
beforeEach(async () => { w = await createWorld(); });

const accepted = (o: Record<string, unknown> = {}) =>
  seedOrder(w.db, w.A, { status: 'arrived_pickup', driver_id: w.d, assigned_at: new Date().toISOString(), ...o });

/** 저장소에 파일을 두고 사진 줄을 넣는다 (경로는 <오더>/<단계>/<칸>.jpg 규칙) */
const putPhoto = async (o: string, slot: string, source?: string) => {
  const path = `${o}/pickup/${slot}.jpg`;
  await w.db.query(`insert into storage.objects(bucket_id, name) values ('order-photos', $1)`, [path]);
  return as(w.db, w.d, tx => source
    ? tx.query(`insert into order_photos(order_id, phase, slot, path, source) values ($1, 'pickup', $2, $3, $4)`, [o, slot, path, source])
    : tx.query(`insert into order_photos(order_id, phase, slot, path) values ($1, 'pickup', $2, $3)`, [o, slot, path]));
};

describe('갤러리에서 고른 사진 표시', () => {
  test('차량 사진: 따로 안 적으면 카메라, 갤러리라고 적으면 갤러리로 남는다', async () => {
    const o = await accepted();
    await putPhoto(o, 'front');
    await putPhoto(o, 'back', 'gallery');
    const rows = (await w.db.query(`select slot, source from order_photos where order_id = $1 order by slot`, [o])).rows;
    expect(rows).toEqual([{ slot: 'back', source: 'gallery' }, { slot: 'front', source: 'camera' }]);
  });

  test('서류 사진도 갤러리 표시가 남는다', async () => {
    const cap = await seedCapital(w.db);
    const o = await accepted({ kind: 'docs', capital_company_id: cap.companyId });
    const path = `${o}/docs/registration.jpg`;
    await w.db.query(`insert into storage.objects(bucket_id, name) values ('order-photos', $1)`, [path]);
    await as(w.db, w.d, tx => tx.query(
      `insert into order_documents(order_id, slot, path, source) values ($1, 'registration', $2, 'gallery')`, [o, path]));
    const r = (await w.db.query(`select source from order_documents where order_id = $1`, [o])).rows[0];
    expect(r).toEqual({ source: 'gallery' });
  });

  test('카메라·갤러리 말고 다른 값은 받지 않는다', async () => {
    const o = await accepted();
    await expect(putPhoto(o, 'left', 'web')).rejects.toThrow(/source/);
  });
});
