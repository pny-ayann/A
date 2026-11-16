import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

let template: Blob | File | undefined;

/** stub + 모든 마이그레이션이 적용된 새 DB. 처음 한 번 만든 뒤에는 복제해서 빠르게 준다. */
export async function createDb(): Promise<PGlite> {
  if (!template) {
    const db = new PGlite();
    await db.exec(readFileSync(join(here, 'stubs.sql'), 'utf8'));
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = readFileSync(join(migrationsDir, f), 'utf8');
      try {
        if (sql.trim()) await db.exec(sql);
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
    template = await db.dumpDataDir('none');
    await db.close();
  }
  return new PGlite({ loadDataDir: template });
}

/** 로그인한 사용자(authenticated 역할)로 fn을 실행한다. */
export async function as<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    return fn(tx);
  });
}

/** 오류 메시지에 code가 들어 있어야 통과 */
export async function expectError(p: Promise<unknown>, code: string): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`expected error containing "${code}" but call succeeded`);
  const msg = (err as Error).message ?? String(err);
  if (!msg.includes(code)) throw new Error(`expected error containing "${code}" but got: ${msg}`);
}

export type UserOpts = {
  loginId: string;
  role?: 'driver' | 'customer' | 'staff';
  companyId?: string;
  staffLevel?: 'admin' | 'operator';
  driverStatus?: 'pending' | 'active' | 'suspended';
  name?: string;
  phone?: string;
  selfSignup?: boolean;
};

export async function createUser(_db: PGlite, _o: UserOpts): Promise<string> {
  throw new Error('Task 3');
}
