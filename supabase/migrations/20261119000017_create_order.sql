-- 고객 오더 접수를 한 번에 저장한다 (오더 + 경유지 + 미션).
-- 전에는 오더를 먼저 넣고 경유지·미션을 따로 넣어서, 그 사이 신호가 끊기거나 기사가 먼저 잡으면
-- 경유지 없는 오더가 공개되거나(요금엔 경유지가 들어 있는데) 경유지 저장이 영영 막혔다.
-- security invoker: 부른 사람의 RLS(orders_insert 등)를 그대로 받는다. 한 번의 호출 = 한 트랜잭션이라
-- 중간에 실패하면 오더도 남지 않고, '새 오더' 알림(pg_net 대기열)도 함께 취소된다.
-- 미션 추가요금은 화면 값이 아니라 서버 missions 값으로 기록한다.

create function public.create_order(p_order jsonb, p_waypoints jsonb, p_mission_ids uuid[])
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  r public.orders;
  v_id uuid;
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_mission_ids, '{}')) x);
  v_found int;
begin
  select count(*) into v_found from public.missions where id = any(v_ids) and active;
  if v_found <> cardinality(v_ids) then raise exception 'INVALID_MISSION'; end if;

  r := jsonb_populate_record(null::public.orders, p_order);
  -- 상태·기사·만든 사람은 받지 않고 서버 기본값에 맡긴다
  insert into public.orders(
    company_id, kind, dispatch_mode, reserved_at,
    pickup_address, pickup_detail, pickup_area, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
    dropoff_address, dropoff_detail, dropoff_area, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
    vehicle_number, vehicle_model, vehicle_color, transmission, driver_memo, payment_method, fare, distance_km
  ) values (
    r.company_id, r.kind, coalesce(r.dispatch_mode, 'open'), r.reserved_at,
    r.pickup_address, r.pickup_detail, r.pickup_area, r.pickup_lat, r.pickup_lng, r.pickup_contact_name, r.pickup_contact_phone,
    r.dropoff_address, r.dropoff_detail, r.dropoff_area, r.dropoff_lat, r.dropoff_lng, r.dropoff_contact_name, r.dropoff_contact_phone,
    r.vehicle_number, r.vehicle_model, r.vehicle_color, r.transmission, r.driver_memo, r.payment_method, r.fare, r.distance_km
  ) returning id into v_id;

  insert into public.order_waypoints(order_id, seq, address, detail, area, lat, lng, contact_name, contact_phone)
  select v_id, x.n, x.w->>'address', x.w->>'detail', x.w->>'area',
         (x.w->>'lat')::double precision, (x.w->>'lng')::double precision, x.w->>'contact_name', x.w->>'contact_phone'
  from jsonb_array_elements(coalesce(p_waypoints, '[]'::jsonb)) with ordinality as x(w, n);

  insert into public.order_missions(order_id, mission_id, extra_fare)
  select v_id, m.id, m.extra_fare from public.missions m where m.id = any(v_ids);

  return v_id;
end $$;
revoke execute on function public.create_order(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.create_order(jsonb, jsonb, uuid[]) to authenticated;
