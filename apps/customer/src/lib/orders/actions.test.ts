import { expect, test } from 'vitest';
import { actionsFor, amendPayload } from './actions';

test('상태별로 고객이 할 수 있는 일', () => {
  expect(actionsFor('open')).toEqual({ cancel: true, edit: true, amend: false });
  for (const s of ['assigned', 'arrived_pickup', 'driving'] as const) {
    expect(actionsFor(s)).toEqual({ cancel: false, edit: false, amend: true });
  }
  expect(actionsFor('completed')).toEqual({ cancel: false, edit: false, amend: false });
  expect(actionsFor('cancelled')).toEqual({ cancel: false, edit: false, amend: false });
});

const place = { address: '서울 강남구 테헤란로 152', detail: '3층', area: '강남구 역삼동', lat: 37.5, lng: 127.03, contactName: '김', contactPhone: '010' };

test('사유를 안 고르면 안내', () => {
  expect(amendPayload({ reason: null, fare: 40000 })).toBe('바꾸는 이유를 골라 주세요.');
});

test('도착지 변경은 새 도착지가 있어야 한다', () => {
  expect(amendPayload({ reason: 'dropoff_change', fare: 40000 })).toBe('새 도착지를 골라 주세요.');
  expect(amendPayload({ reason: 'dropoff_change', fare: 40000, place })).toEqual({
    p_reason: 'dropoff_change', p_fare: 40000,
    p_dropoff: { address: place.address, detail: '3층', area: '강남구 역삼동', lat: 37.5, lng: 127.03, contact_name: '김', contact_phone: '010' },
  });
});

test('경유지 추가는 경유지 주소가 있어야 한다', () => {
  expect(amendPayload({ reason: 'waypoint_added', fare: 40000 })).toBe('추가할 경유지를 골라 주세요.');
  const r = amendPayload({ reason: 'waypoint_added', fare: 40000, place: { ...place, detail: '', contactName: '' } });
  expect(r).toMatchObject({ p_reason: 'waypoint_added', p_waypoint: { address: place.address, detail: null, contact_name: null } });
});

test('미션 추가는 미션을 골라야 한다', () => {
  expect(amendPayload({ reason: 'mission_added', fare: 40000 })).toBe('추가할 미션을 골라 주세요.');
  expect(amendPayload({ reason: 'mission_added', fare: 40000, missionId: 'm1' })).toEqual({ p_reason: 'mission_added', p_fare: 40000, p_mission_id: 'm1' });
});

test('요금은 0원 이상 정수', () => {
  expect(amendPayload({ reason: 'mission_added', fare: null, missionId: 'm1' })).toBe('새 요금을 넣어 주세요.');
  expect(amendPayload({ reason: 'mission_added', fare: -1, missionId: 'm1' })).toBe('요금은 0원 이상 정수로 넣어 주세요.');
  expect(amendPayload({ reason: 'mission_added', fare: 1.5, missionId: 'm1' })).toBe('요금은 0원 이상 정수로 넣어 주세요.');
});
