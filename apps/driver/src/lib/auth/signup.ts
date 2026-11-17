import { errorMessage, loginIdToEmail } from '@takson/shared';

export type SignupForm = { loginId: string; password: string; password2: string; name: string; phone: string };

/** 가입 입력의 첫 문제를 한국어로. 문제가 없으면 null */
export function validateSignup(f: SignupForm): string | null {
  try { loginIdToEmail(f.loginId); } catch { return errorMessage('INVALID_LOGIN_ID'); }
  if (f.password.length < 8) return '비밀번호는 8자 이상이에요.';
  if (f.password !== f.password2) return '비밀번호가 서로 달라요.';
  if (!f.name.trim()) return '이름을 적어 주세요.';
  if (!/^01[016789]\d{7,8}$/.test(f.phone.replace(/[-\s]/g, ''))) return '전화번호를 확인해 주세요.';
  return null;
}
