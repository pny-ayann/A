import { calcFare } from './fare';

const bands = [{ max_km: 10, fare: 20000 }, { max_km: 30, fare: 35000 }, { max_km: 50, fare: 50000 }];
test('구간 상한 이하이면 그 구간 요금', () => {
  expect(calcFare(10, bands)).toBe(20000);
  expect(calcFare(10.1, bands)).toBe(35000);
});
test('미션 추가 요금을 더한다', () => { expect(calcFare(25, bands, [5000, 3000])).toBe(43000); });
test('마지막 구간을 넘으면 마지막 구간 요금', () => { expect(calcFare(80, bands)).toBe(50000); });
test('bands 순서가 섞여 있어도 동작', () => { expect(calcFare(5, [...bands].reverse())).toBe(20000); });
