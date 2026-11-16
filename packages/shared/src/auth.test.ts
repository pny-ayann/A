import { loginIdToEmail } from './auth';

test('아이디를 이메일로', () => { expect(loginIdToEmail(' Kim01 ')).toBe('kim01@takson.local'); });
test('허용하지 않는 문자는 거부', () => { expect(() => loginIdToEmail('김기사')).toThrow('INVALID_LOGIN_ID'); });
