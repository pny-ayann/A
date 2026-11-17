import { expect, test } from 'vitest';
import { emptyPlace, toOrderInsert, validateOrderForm, type OrderForm } from './form';

const now = new Date('2026-11-17T03:00:00Z');
const place = (address: string) => ({ ...emptyPlace(), address, area: '중구 태평로1가', lat: 37.56, lng: 126.97 });
const okForm: OrderForm = {
  companyId: 'c1', kind: 'takson', pickup: place('서울 중구 세종대로 110'), dropoff: place('서울 강남구 강남대로 396'),
  waypoints: [], vehicleNumber: '12가3456', vehicleModel: '', vehicleColor: '', transmission: '', driverMemo: '',
  missionIds: [], reservedAt: null, paymentMethod: 'postpaid', fare: 35000, distanceKm: 12.3, staffOnly: false,
};

test('정상 폼은 통과', () => { expect(validateOrderForm(okForm, now)).toBeNull(); });
test('업체, 출발지, 도착지, 차량번호 필수', () => {
  expect(validateOrderForm({ ...okForm, companyId: '' }, now)).toBe('업체를 골라 주세요.');
  expect(validateOrderForm({ ...okForm, pickup: emptyPlace() }, now)).toBe('출발지를 입력해 주세요.');
  expect(validateOrderForm({ ...okForm, dropoff: { ...emptyPlace(), address: '  ' } }, now)).toBe('도착지를 입력해 주세요.');
  expect(validateOrderForm({ ...okForm, vehicleNumber: ' ' }, now)).toBe('차량번호를 입력해 주세요.');
});
test('주소 없는 경유지는 오류', () => {
  expect(validateOrderForm({ ...okForm, waypoints: [emptyPlace()] }, now)).toBe('경유지 주소를 입력하거나 경유지를 지워 주세요.');
});
test('요금을 못 구했으면 접수 불가', () => {
  expect(validateOrderForm({ ...okForm, fare: null }, now)).toBe('요금을 입력해 주세요.');
});
test('요금 음수·소수 금지', () => {
  expect(validateOrderForm({ ...okForm, fare: -1 }, now)).toBe('요금은 0원 이상 정수로 넣어 주세요.');
  expect(validateOrderForm({ ...okForm, fare: 100.5 }, now)).toBe('요금은 0원 이상 정수로 넣어 주세요.');
});
test('지난 예약 시간은 오류', () => {
  expect(validateOrderForm({ ...okForm, reservedAt: '2000-01-01T00:00:00Z' }, now)).toBe('예약 시간이 지났어요.');
});
test('잘못된 예약 시간 문자열은 오류', () => {
  expect(validateOrderForm({ ...okForm, reservedAt: 'abc' }, now)).toBe('예약 시간을 다시 골라 주세요.');
});
test('관제 배차 전용 체크는 staff_only', () => {
  expect(toOrderInsert({ ...okForm, staffOnly: true }).dispatch_mode).toBe('staff_only');
  expect(toOrderInsert(okForm).dispatch_mode).toBe('open');
});
test('빈 차량 색상은 null', () => { expect(toOrderInsert({ ...okForm, vehicleColor: '' }).vehicle_color).toBeNull(); });
test('컬럼 이름으로 바꾼다', () => {
  const row = toOrderInsert({ ...okForm, transmission: 'auto', reservedAt: '2026-11-18T01:00:00.000Z' });
  expect(row).toMatchObject({
    company_id: 'c1', kind: 'takson', pickup_address: '서울 중구 세종대로 110', pickup_area: '중구 태평로1가',
    pickup_lat: 37.56, pickup_detail: null, dropoff_address: '서울 강남구 강남대로 396', vehicle_number: '12가3456',
    transmission: 'auto', payment_method: 'postpaid', fare: 35000, distance_km: 12.3,
    reserved_at: '2026-11-18T01:00:00.000Z',
  });
  expect(row).not.toHaveProperty('status');
});
