import { contentDisposition, lastMonth, linesMatchTotal, monthRange, monthStart, parseMonth, payState, statementFileName } from './month';

const now = new Date('2026-11-20T08:00:00Z');

test('지난 달은 한국 시간으로', () => {
  expect(lastMonth(new Date('2026-11-30T15:30:00Z'))).toBe('2026-11'); // KST 12/01 00:30
  expect(lastMonth(new Date('2026-11-30T14:30:00Z'))).toBe('2026-10'); // KST 11/30 23:30
  expect(lastMonth(new Date('2026-01-10T00:00:00Z'))).toBe('2025-12');
});

test('잘못된 달은 지난 달로', () => {
  expect(parseMonth('2026-13', now)).toBe('2026-10');
  expect(parseMonth(undefined, now)).toBe('2026-10');
  expect(parseMonth('abc', now)).toBe('2026-10');
  expect(parseMonth('2026-02', now)).toBe('2026-02');
});

test('달 범위', () => {
  expect(monthRange('2026-02')).toBe('2026-02-01 ~ 2026-02-28');
  expect(monthRange('2028-02')).toBe('2028-02-01 ~ 2028-02-29');
  expect(monthRange('2026-12')).toBe('2026-12-01 ~ 2026-12-31');
  expect(monthStart('2026-11')).toBe('2026-11-01');
});

test('입금 상태', () => {
  expect(payState(330000, 330000)).toEqual({ kind: 'paid', extra: 0 });
  expect(payState(440000, 330000)).toEqual({ kind: 'changed', extra: 0 });
  expect(payState(0, 330000)).toEqual({ kind: 'changed', extra: 330000 });
  expect(payState(165000, null)).toEqual({ kind: 'unpaid', extra: 0 });
  expect(payState(0, null)).toEqual({ kind: 'none', extra: 0 });
});

test('파일 이름에서 못 쓰는 글자를 바꾼다', () => {
  expect(statementFileName(' 개발/상사"A ', '2026-11')).toBe('정산서_개발_상사_A_2026-11.xlsx');
  expect(statementFileName('개발상사A', '2026-11')).toBe('정산서_개발상사A_2026-11.xlsx');
});

test('내려받기 헤더: (주)·따옴표도 이스케이프하고 영문 대체 이름을 단다', () => {
  expect(contentDisposition("정산서_(주)개발's_2026-11.xlsx", 'statement_2026-11.xlsx')).toBe(
    `attachment; filename="statement_2026-11.xlsx"; filename*=UTF-8''${encodeURIComponent('정산서_')}%28%EC%A3%BC%29${encodeURIComponent('개발')}%27s_2026-11.xlsx`);
});

test('줄 합과 합계가 맞는지 본다', () => {
  const lines = [{ fare: 100000, fuel: 5000 }, { fare: 50000, fuel: 0 }];
  expect(linesMatchTotal(lines, { supply: 150000, fuel: 5000 })).toBe(true);
  expect(linesMatchTotal(lines, { supply: 160000, fuel: 5000 })).toBe(false);
  expect(linesMatchTotal(lines, { supply: 150000, fuel: 0 })).toBe(false);
  expect(linesMatchTotal([], { supply: 0, fuel: 0 })).toBe(true);
});
