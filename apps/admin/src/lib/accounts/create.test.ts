import { describe, expect, test } from 'vitest';
import { buildAppMetadata, createAccount, type AccountAdmin, type NewAccount } from './create';

type Reply = { data?: { user: { id: string } | null }; error?: { message: string } | null };
function fakeAdmin(reply: Reply = { data: { user: { id: 'u1' } }, error: null }) {
  const calls: unknown[] = [];
  const admin: AccountAdmin & { calls: unknown[] } = {
    calls,
    auth: {
      admin: {
        createUser: async (attrs: unknown) => {
          calls.push(attrs);
          return { data: reply.data ?? { user: null }, error: reply.error ?? null };
        },
      },
    },
  };
  return admin;
}

const okDriver: NewAccount = { role: 'driver', loginId: 'kim01', password: '12345678', name: '김', phone: '010' };

describe('buildAppMetadata', () => {
  test('관제가 만든 기사는 바로 승인 상태', () => {
    expect(buildAppMetadata({ role: 'driver', loginId: 'kim01', password: 'x', name: '김', phone: '010' }))
      .toEqual({ role: 'driver', driver_status: 'active', name: '김', phone: '010' });
  });
  test('업체 직원은 company_id가 들어간다', () => {
    expect(buildAppMetadata({ role: 'customer', companyId: 'c1', loginId: 'lee01', password: 'x', name: '이', phone: '011' }))
      .toEqual({ role: 'customer', company_id: 'c1', name: '이', phone: '011' });
  });
  test('관제 직원은 등급이 들어간다', () => {
    expect(buildAppMetadata({ role: 'staff', staffLevel: 'operator', loginId: 'op01', password: 'x', name: '박', phone: '012' }))
      .toEqual({ role: 'staff', staff_level: 'operator', name: '박', phone: '012' });
  });
});

describe('createAccount', () => {
  test('한글 아이디는 서버에 보내지 않고 오류', async () => {
    const admin = fakeAdmin();
    expect(await createAccount(admin, { role: 'driver', loginId: '김기사', password: '12345678', name: '', phone: '' }))
      .toEqual({ ok: false, message: '아이디는 영문 소문자, 숫자, _ 로 3~20자예요.' });
    expect(admin.calls).toHaveLength(0);
  });
  test('이미 있는 아이디', async () => {
    const admin = fakeAdmin({ error: { message: 'A user with this email address has already been registered' } });
    expect(await createAccount(admin, okDriver)).toEqual({ ok: false, message: '이미 쓰는 아이디예요.' });
  });
  test('비밀번호 8자 미만', async () => {
    const admin = fakeAdmin();
    expect(await createAccount(admin, { ...okDriver, password: '1234567' }))
      .toEqual({ ok: false, message: '비밀번호는 8자 이상이에요.' });
    expect(admin.calls).toHaveLength(0);
  });
  test('성공하면 이메일 확인된 계정을 만들고 id를 돌려준다', async () => {
    const admin = fakeAdmin();
    expect(await createAccount(admin, { ...okDriver, loginId: ' Kim01 ' })).toEqual({ ok: true, id: 'u1' });
    expect(admin.calls).toEqual([{
      email: 'kim01@takson.local', password: '12345678', email_confirm: true,
      app_metadata: { role: 'driver', driver_status: 'active', name: '김', phone: '010' },
    }]);
  });
  test('그 밖의 서버 오류는 일반 문구', async () => {
    const admin = fakeAdmin({ error: { message: 'network down' } });
    expect(await createAccount(admin, okDriver)).toEqual({ ok: false, message: '계정을 만들지 못했어요. 잠시 뒤 다시 해 주세요.' });
  });
});
