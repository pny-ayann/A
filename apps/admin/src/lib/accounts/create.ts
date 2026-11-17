import { errorMessage, loginIdToEmail } from '@takson/shared';

export type NewAccount = { loginId: string; password: string; name: string; phone: string } & (
  | { role: 'customer'; companyId: string }
  | { role: 'driver' }
  | { role: 'staff'; staffLevel: 'admin' | 'operator' }
);

/** createAccount가 쓰는 서비스 키 클라이언트의 일부 (테스트에서 가짜로 바꿀 수 있게) */
export type AccountAdmin = {
  auth: {
    admin: {
      createUser(attrs: {
        email: string; password: string; email_confirm: boolean; app_metadata: Record<string, unknown>;
      }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    };
  };
};

/** 계정에 넣을 app_metadata. 서버 트리거가 이 값으로 프로필을 만든다. */
export function buildAppMetadata(a: NewAccount): Record<string, unknown> {
  const base = { name: a.name, phone: a.phone };
  switch (a.role) {
    case 'customer': return { role: 'customer', company_id: a.companyId, ...base };
    case 'driver': return { role: 'driver', driver_status: 'active', ...base };
    case 'staff': return { role: 'staff', staff_level: a.staffLevel, ...base };
  }
}

export type CreateResult = { ok: true; id: string } | { ok: false; message: string };

/** 관리자 확인을 마친 서버 액션에서만 부른다. */
export async function createAccount(admin: AccountAdmin, a: NewAccount): Promise<CreateResult> {
  let email: string;
  try {
    email = loginIdToEmail(a.loginId);
  } catch {
    return { ok: false, message: errorMessage('INVALID_LOGIN_ID') };
  }
  if (a.password.length < 8) return { ok: false, message: '비밀번호는 8자 이상이에요.' };

  const { data, error } = await admin.auth.admin.createUser({
    email, password: a.password, email_confirm: true, app_metadata: buildAppMetadata(a),
  });
  if (error) {
    if (/already/i.test(error.message)) return { ok: false, message: '이미 쓰는 아이디예요.' };
    return { ok: false, message: '계정을 만들지 못했어요. 잠시 뒤 다시 해 주세요.' };
  }
  if (!data.user) return { ok: false, message: '계정을 만들지 못했어요. 잠시 뒤 다시 해 주세요.' };
  return { ok: true, id: data.user.id };
}
