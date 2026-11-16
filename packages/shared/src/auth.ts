/** 로그인 아이디를 Supabase Auth용 이메일로 바꾼다. */
export function loginIdToEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(id)) throw new Error('INVALID_LOGIN_ID');
  return `${id}@takson.local`;
}
