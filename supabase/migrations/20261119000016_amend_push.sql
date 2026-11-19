-- 고객 변경 요청(도착지 변경·경유지 추가·미션 추가) → 배정 기사에게 늘 알림 (설계 7.2 "기사·관제에 즉시 알림").
-- 전에는 요금이 바뀔 때만 '요금이 바뀌었어요'가 가서, 요금 그대로 도착지만 바꾸면 기사가 몰랐다.
-- 변경 요청 안에서는 orders_push의 요금 알림을 끄고(app.amend), 사유와 요금을 담은 알림 하나만 보낸다.
-- 관제는 웹 관제판의 실시간 기록(order_events)으로 본다.

create or replace function public.orders_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_old_driver uuid := case when tg_op = 'UPDATE' then old.driver_id end;
  v_became_open boolean;
  v_targets uuid[];
  v_reserved text := '';
begin
  begin
    -- ① 새로 공개된 오더 → 승인된 기사 모두 (움직인 사람과 방금 빠진 기사는 빼고)
    v_became_open := new.status = 'open' and new.dispatch_mode = 'open'
      and (tg_op = 'INSERT' or old.status <> 'open' or old.dispatch_mode <> 'open');
    if v_became_open then
      select array_agg(p.id) into v_targets
      from public.profiles p
      where p.role = 'driver' and p.driver_status = 'active'
        and p.id is distinct from v_actor and p.id is distinct from v_old_driver;
      if new.reserved_at is not null then
        v_reserved := '[예약] ' || to_char(new.reserved_at at time zone 'Asia/Seoul', 'FMMM/FMDD HH24:MI') || ' · ';
      end if;
      if v_targets is not null then
        perform public.send_push(v_targets, '새 오더',
          v_reserved || public.order_route_text(new) || ' · ' || public.won_text(new.fare),
          jsonb_build_object('orderId', new.id, 'screen', 'list'));
      end if;
    end if;

    if tg_op = 'UPDATE' then
      -- ④ 관제가 취소 → 원래 기사
      if new.status = 'cancelled' and old.status <> 'cancelled' and old.driver_id is not null
         and old.driver_id is distinct from v_actor then
        perform public.send_push(array[old.driver_id], '관제가 오더를 취소했어요',
          public.order_route_text(new), jsonb_build_object('orderId', new.id, 'screen', 'list'));
      -- ④ 관제가 회수(또는 다른 기사로 바꿈) → 원래 기사
      elsif old.driver_id is not null and new.driver_id is distinct from old.driver_id
         and old.driver_id is distinct from v_actor then
        perform public.send_push(array[old.driver_id], '관제가 오더를 회수했어요',
          public.order_route_text(new), jsonb_build_object('orderId', new.id, 'screen', 'list'));
      end if;

      -- ③ 배정된 기사가 있는 오더의 요금 변경 → 그 기사 (고객 변경 요청은 customer_amend_order가 따로 알린다)
      if new.fare <> old.fare and new.driver_id is not null and new.driver_id is distinct from v_actor
         and new.status in ('assigned', 'arrived_pickup', 'driving')
         and coalesce(current_setting('app.amend', true), '') <> 'on' then
        perform public.send_push(array[new.driver_id], '요금이 바뀌었어요',
          public.won_text(old.fare) || ' → ' || public.won_text(new.fare),
          jsonb_build_object('orderId', new.id, 'screen', 'order'));
      end if;
    end if;

    -- ② 관제가 기사를 지정 → 그 기사 (기사 본인이 잡은 건 빼고)
    if new.driver_id is not null and new.driver_id is distinct from v_old_driver
       and new.driver_id is distinct from v_actor then
      perform public.send_push(array[new.driver_id], '배차됐어요',
        public.order_route_text(new) || ' · ' || public.won_text(new.fare),
        jsonb_build_object('orderId', new.id, 'screen', 'order'));
    end if;
  exception when others then
    raise warning 'orders_push failed: %', sqlerrm;
  end;
  return null;
end $$;

create or replace function public.customer_amend_order(
  p_order_id uuid, p_reason text, p_fare int,
  p_dropoff jsonb default null, p_waypoint jsonb default null, p_mission_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_old_fare int;
  v_driver uuid;
  v_extra int;
  v_mission text;
  v_label text;
begin
  select status, fare, driver_id into v_status, v_old_fare, v_driver from public.orders
  where id = p_order_id and company_id = public.my_company_id()
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status not in ('assigned', 'arrived_pickup', 'driving') then raise exception 'INVALID_TRANSITION'; end if;
  if p_fare is null or p_fare < 0 then raise exception 'INVALID_AMENDMENT'; end if;

  perform set_config('app.rpc', 'on', true);
  perform set_config('app.reason', p_reason, true);
  perform set_config('app.amend', 'on', true);

  if p_reason = 'dropoff_change' and nullif(p_dropoff->>'address', '') is not null then
    update public.orders set
      dropoff_address = p_dropoff->>'address',
      dropoff_detail = p_dropoff->>'detail',
      dropoff_area = p_dropoff->>'area',
      dropoff_lat = (p_dropoff->>'lat')::double precision,
      dropoff_lng = (p_dropoff->>'lng')::double precision,
      dropoff_contact_name = p_dropoff->>'contact_name',
      dropoff_contact_phone = p_dropoff->>'contact_phone',
      fare = p_fare
    where id = p_order_id;
    v_label := '도착지 변경';
  elsif p_reason = 'waypoint_added' and nullif(p_waypoint->>'address', '') is not null then
    insert into public.order_waypoints(order_id, seq, address, detail, area, lat, lng, contact_name, contact_phone)
    select p_order_id, coalesce(max(seq), 0) + 1, p_waypoint->>'address', p_waypoint->>'detail', p_waypoint->>'area',
           (p_waypoint->>'lat')::double precision, (p_waypoint->>'lng')::double precision,
           p_waypoint->>'contact_name', p_waypoint->>'contact_phone'
    from public.order_waypoints where order_id = p_order_id;
    update public.orders set fare = p_fare where id = p_order_id;
    v_label := '경유지 추가';
  elsif p_reason = 'mission_added' and p_mission_id is not null then
    select extra_fare, name into v_extra, v_mission from public.missions where id = p_mission_id and active;
    if not found then raise exception 'INVALID_AMENDMENT'; end if;
    insert into public.order_missions(order_id, mission_id, extra_fare)
    values (p_order_id, p_mission_id, v_extra)
    on conflict do nothing;
    update public.orders set fare = p_fare where id = p_order_id;
    v_label := '미션 추가(' || v_mission || ')';
  else
    raise exception 'INVALID_AMENDMENT';
  end if;

  perform set_config('app.amend', '', true);

  -- 배정 기사에게 알림 (실패해도 변경은 그대로)
  begin
    if v_driver is not null then
      perform public.send_push(array[v_driver], '오더가 바뀌었어요',
        v_label || ' · ' || case when p_fare = v_old_fare then '요금 그대로 ' || public.won_text(p_fare)
                                 else public.won_text(v_old_fare) || ' → ' || public.won_text(p_fare) end,
        jsonb_build_object('orderId', p_order_id, 'screen', 'order'));
    end if;
  exception when others then
    raise warning 'amend push failed: %', sqlerrm;
  end;
end $$;
