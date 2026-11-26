import { expect, test } from 'vitest';
import { describeEvent, needsReason, PHOTO_SLOTS, SLOT_LABEL } from './actions';

test('도착 사진이 없으면 완료로 갈 때 사유 필요', () => {
  expect(needsReason('driving', 'completed', { pickup: [], dropoff: ['front'] })).toBe(true);
});
test('사진이 다 있으면 사유 불필요', () => { expect(needsReason('driving', 'completed', { pickup: [], dropoff: [] })).toBe(false); });
test('취소는 항상 사유', () => { expect(needsReason('open', 'cancelled', { pickup: [], dropoff: [] })).toBe(true); });
test('출발 사진이 없으면 운행 중으로 갈 때 사유 필요, 도착 사진은 상관없음', () => {
  expect(needsReason('arrived_pickup', 'driving', { pickup: ['back'], dropoff: [] })).toBe(true);
  expect(needsReason('arrived_pickup', 'driving', { pickup: [], dropoff: ['back'] })).toBe(false);
});
test('수락함으로 갈 때는 사진과 상관없이 사유 불필요', () => {
  expect(needsReason('assigned', 'arrived_pickup', { pickup: ['front'], dropoff: ['front'] })).toBe(false);
});

test('요금 이력 문장', () => {
  expect(describeEvent({ type: 'fare', reason: 'dropoff_change', data: { from: 50000, to: 60000 } }))
    .toBe('요금 50,000원 → 60,000원 (도착지 변경)');
});
test('사유 없는 요금 이력', () => {
  expect(describeEvent({ type: 'fare', reason: null, data: { from: 30000, to: 35000 } })).toBe('요금 30,000원 → 35,000원');
});
test('사진 예외 이력 문장', () => {
  expect(describeEvent({ type: 'photo_override', reason: '기사 휴대폰 고장', data: { missing: { dropoff: ['front','back','left','right','dashboard'] } } }))
    .toBe('사진 없이 진행: 도착 사진 5장 없음 – 기사 휴대폰 고장');
});
test('출발·도착 사진이 모두 빠진 예외', () => {
  expect(describeEvent({ type: 'photo_override', reason: '급함', data: { missing: { pickup: ['front'], dropoff: ['front', 'back'] } } }))
    .toBe('사진 없이 진행: 출발 사진 1장, 도착 사진 2장 없음 – 급함');
});
test('반납 이력 문장', () => { expect(describeEvent({ type: 'released', reason: '차량 위치 착오' })).toBe('기사 반납 – 차량 위치 착오'); });
test('상태 이력 문장', () => {
  expect(describeEvent({ type: 'status', from_status: 'assigned', to_status: 'arrived_pickup' })).toBe('배차됨 → 수락함');
  expect(describeEvent({ type: 'status', from_status: 'open', to_status: 'cancelled', reason: '고객 요청' })).toBe('접수 → 취소 – 고객 요청');
});
test('회수·재배차·수정 이력 문장', () => {
  expect(describeEvent({ type: 'unassigned', reason: '연락 안 됨' })).toBe('관제 회수 – 연락 안 됨');
  expect(describeEvent({ type: 'reassigned', data: { from: 'a', to: 'b' } })).toBe('다른 기사로 다시 배차');
  expect(describeEvent({ type: 'edit', data: ['dropoff_address', 'vehicle_number'] })).toBe('수정: 도착지 주소, 차량번호');
});
test('모르는 이력 종류도 깨지지 않음', () => {
  expect(describeEvent({ type: 'something_new' })).toBe('something_new');
});
test('필수 사진 칸 여섯 개와 이름', () => {
  expect(PHOTO_SLOTS.map(s => SLOT_LABEL[s])).toEqual(['앞', '뒤', '왼쪽', '오른쪽', '계기판', '차키']);
});

import { rowToForm, validateOrderEdit } from './actions';

const dbRow = {
  company_id: 'c1', kind: 'takson', dispatch_mode: 'staff_only', reserved_at: '2026-11-17T01:00:00Z',
  pickup_address: '서울 중구 세종대로 110', pickup_detail: null, pickup_area: '중구', pickup_lat: 37.5, pickup_lng: 126.9,
  pickup_contact_name: '김', pickup_contact_phone: null,
  dropoff_address: '서울 강남구 테헤란로 1', dropoff_detail: '2층', dropoff_area: '강남구', dropoff_lat: 37.4, dropoff_lng: 127.0,
  dropoff_contact_name: null, dropoff_contact_phone: '010',
  vehicle_number: '12가3456', vehicle_model: null, vehicle_color: null, transmission: null, driver_memo: null,
  payment_method: 'cash', fare: 35000, distance_km: 10.4,
};

test('저장된 오더를 수정 폼으로 바꾼다 (빈 값은 빈 칸)', () => {
  const f = rowToForm(dbRow);
  expect(f.staffOnly).toBe(true);
  expect(f.pickup).toEqual({ address: '서울 중구 세종대로 110', detail: '', area: '중구', lat: 37.5, lng: 126.9, contactName: '김', contactPhone: '' });
  expect(f.dropoff.detail).toBe('2층');
  expect(f.vehicleModel).toBe('');
  expect(f.transmission).toBe('');
  expect(f.fare).toBe(35000);
  expect(f.distanceKm).toBe(10.4);
  expect(f.reservedAt).toBe('2026-11-17T01:00:00Z');
});

test('지난 예약 시간이라도 안 바꿨으면 수정 저장 가능', () => {
  const f = rowToForm(dbRow);
  expect(validateOrderEdit(f, dbRow.reserved_at, new Date('2026-11-17T05:00:00Z'))).toBeNull();
});

test('예약 시간을 지난 시각으로 바꾸면 막는다', () => {
  const f = { ...rowToForm(dbRow), reservedAt: '2026-11-17T02:00:00Z' };
  expect(validateOrderEdit(f, dbRow.reserved_at, new Date('2026-11-17T05:00:00Z'))).toBe('예약 시간이 지났어요.');
});

test('수정에서도 필수 칸 검사', () => {
  const f = { ...rowToForm(dbRow), vehicleNumber: ' ' };
  expect(validateOrderEdit(f, dbRow.reserved_at, new Date('2026-11-17T05:00:00Z'))).toBe('차량번호를 입력해 주세요.');
});

import { changedColumns } from './actions';

test('수정 저장은 바꾼 칸만 보낸다 (그사이 다른 사람이 바꾼 칸을 덮지 않게)', () => {
  const before = rowToForm(dbRow);
  const after = { ...before, driverMemo: '조심히', dropoff: { ...before.dropoff, detail: '3층' } };
  expect(changedColumns(before, after)).toEqual({ dropoff_detail: '3층', driver_memo: '조심히' });
});
test('아무것도 안 바꾸면 빈 객체', () => {
  const f = rowToForm(dbRow);
  expect(changedColumns(f, { ...f })).toEqual({});
});
test('서류 확인·사진 불인정 이력', () => {
  expect(describeEvent({ type: 'doc_review', reason: null, data: { label: '인감(본인서명사실확인서)', ok: true } }))
    .toBe('서류 인정: 인감(본인서명사실확인서)');
  expect(describeEvent({ type: 'doc_review', reason: '용도 틀림', data: { label: '인감(본인서명사실확인서)', ok: false } }))
    .toBe('서류 불인정: 인감(본인서명사실확인서) — 용도 틀림');
  expect(describeEvent({ type: 'photo_reject', reason: '잘림', data: { phase: 'pickup', slot: 'front' } }))
    .toBe('사진 불인정: 출발 앞 — 잘림');
});
test('서류탁송 캐피탈 회사도 수정 칸에 들어간다', () => {
  const before = rowToForm({ kind: 'takson', capital_company_id: null });
  const after = { ...before, kind: 'docs' as const, capitalCompanyId: 'cap1' };
  expect(changedColumns(before, after)).toMatchObject({ kind: 'docs', capital_company_id: 'cap1' });
});
