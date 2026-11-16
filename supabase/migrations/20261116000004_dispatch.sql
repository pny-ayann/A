-- 기사 공개 목록, 잡기, 반납, 진행 단계, 사진

create function public.haversine_km(lat1 double precision, lng1 double precision,
                                    lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- 기사가 이 예약 시간(null이면 일반 오더)의 오더를 더 잡을 수 있는지. 문제 코드 목록, 비면 가능.
create function public.driver_conflicts(p_driver_id uuid, p_reserved_at timestamptz,
                                        p_exclude_order uuid default null)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_gap interval := make_interval(mins => (select reservation_gap_min from public.settings where id = 1));
  v_out text[] := '{}';
begin
  if p_reserved_at is null then
    if exists (select 1 from public.orders where driver_id = p_driver_id
               and status in ('assigned', 'arrived_pickup', 'driving')
               and id is distinct from p_exclude_order and reserved_at is null) then
      v_out := array_append(v_out, 'HAS_ACTIVE_ORDER');
    end if;
    if exists (select 1 from public.orders where driver_id = p_driver_id
               and status in ('assigned', 'arrived_pickup', 'driving')
               and id is distinct from p_exclude_order and reserved_at is not null
               and abs(extract(epoch from reserved_at - now())) < extract(epoch from v_gap)) then
      v_out := array_append(v_out, 'RESERVATION_CONFLICT');
    end if;
  else
    if exists (select 1 from public.orders where driver_id = p_driver_id
               and status in ('assigned', 'arrived_pickup', 'driving')
               and id is distinct from p_exclude_order and reserved_at is not null
               and abs(extract(epoch from reserved_at - p_reserved_at)) < extract(epoch from v_gap))
       or (p_reserved_at < now() + v_gap and exists (
               select 1 from public.orders where driver_id = p_driver_id
               and status in ('assigned', 'arrived_pickup', 'driving')
               and id is distinct from p_exclude_order and reserved_at is null)) then
      v_out := array_append(v_out, 'RESERVATION_CONFLICT');
    end if;
  end if;
  return v_out;
end $$;

create function public.list_open_orders(p_lat double precision default null, p_lng double precision default null)
returns table(id uuid, kind text, reserved_at timestamptz, pickup_area text, dropoff_area text, fare int,
              payment_method text, distance_km double precision, mission_names text[])
language sql stable security definer set search_path = public as $$
  select o.id, o.kind, o.reserved_at, o.pickup_area, o.dropoff_area, o.fare, o.payment_method,
         case when p_lat is not null and p_lng is not null and o.pickup_lat is not null and o.pickup_lng is not null
              then public.haversine_km(p_lat, p_lng, o.pickup_lat, o.pickup_lng) end as distance_km,
         coalesce((select array_agg(m.name order by m.name)
                   from public.order_missions om join public.missions m on m.id = om.mission_id
                   where om.order_id = o.id), '{}') as mission_names
  from public.orders o
  where public.is_active_driver() and o.status = 'open' and o.dispatch_mode = 'open'
  order by (o.reserved_at is not null),
           case when o.reserved_at is null then
             case when p_lat is not null and p_lng is not null and o.pickup_lat is not null and o.pickup_lng is not null
                  then public.haversine_km(p_lat, p_lng, o.pickup_lat, o.pickup_lng) end
           end nulls last,
           o.reserved_at,
           o.created_at
$$;

create function public.set_rpc_context(p_reason text, p_lat double precision, p_lng double precision) returns void
language sql as $$
  select set_config('app.rpc', 'on', true),
         set_config('app.reason', coalesce(p_reason, ''), true),
         set_config('app.lat', coalesce(p_lat::text, ''), true),
         set_config('app.lng', coalesce(p_lng::text, ''), true);
$$;
revoke execute on function public.set_rpc_context(text, double precision, double precision) from public, anon, authenticated;

create function public.claim_order(p_order_id uuid, p_lat double precision default null,
                                   p_lng double precision default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_conflicts text[];
begin
  if not public.is_active_driver() then raise exception 'DRIVER_NOT_ACTIVE'; end if;
  -- 같은 기사의 동시 잡기를 한 줄로 세운다
  perform 1 from public.profiles where id = auth.uid() for update;

  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.dispatch_mode <> 'open' then raise exception 'NOT_OPEN'; end if;
  if v_order.status in ('assigned', 'arrived_pickup', 'driving') then raise exception 'ALREADY_TAKEN'; end if;
  if v_order.status <> 'open' then raise exception 'NOT_OPEN'; end if;

  v_conflicts := public.driver_conflicts(auth.uid(), v_order.reserved_at, p_order_id);
  if cardinality(v_conflicts) > 0 then raise exception '%', v_conflicts[1]; end if;

  perform public.set_rpc_context(null, p_lat, p_lng);
  update public.orders set status = 'assigned', driver_id = auth.uid(), assigned_at = now()
  where id = p_order_id and status = 'open' and dispatch_mode = 'open';
  if not found then raise exception 'ALREADY_TAKEN'; end if;
end $$;

-- 반납 ------------------------------------------------------------------------
create function public.release_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_window int;
begin
  select * into v_order from public.orders where id = p_order_id and driver_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status not in ('assigned', 'arrived_pickup') then raise exception 'INVALID_TRANSITION'; end if;
  select case when v_order.kind = 'daeri' then release_min_daeri else release_min_takson end
    into v_window from public.settings where id = 1;
  if now() - v_order.assigned_at > make_interval(mins => v_window) then
    raise exception 'RELEASE_WINDOW_PASSED';
  end if;

  perform public.set_rpc_context(p_reason, null, null);
  update public.orders set status = 'open', driver_id = null, assigned_at = null where id = p_order_id;
  insert into public.order_events(order_id, actor_id, type, reason)
  values (p_order_id, auth.uid(), 'released', p_reason);
end $$;

-- 사진 --------------------------------------------------------------------------
create function public.missing_photos(p_order_id uuid, p_phase text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s order by ord), '{}')
  from unnest(array['front', 'back', 'left', 'right', 'dashboard']) with ordinality as t(s, ord)
  where not exists (
    select 1 from public.order_photos p where p.order_id = p_order_id and p.phase = p_phase and p.slot = t.s
  )
$$;

-- 지금 오더 상태에서 이 단계 사진을 올릴 수 있는지 (배정 기사 기준)
create function public.photo_phase_open(p_order_id uuid, p_phase text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.driver_id = auth.uid()
      and case p_phase
            when 'pickup' then o.status in ('assigned', 'arrived_pickup')
            when 'dropoff' then o.status = 'driving'
            when 'extra' then o.status in ('assigned', 'arrived_pickup', 'driving')
            else false
          end
  )
$$;

alter table public.order_photos enable row level security;
create policy order_photos_select on public.order_photos for select using (public.can_read_order(order_id));
create policy order_photos_write on public.order_photos for all
  using (public.is_staff() or public.photo_phase_open(order_id, phase))
  with check (public.is_staff() or public.photo_phase_open(order_id, phase));

-- 진행 단계 -------------------------------------------------------------------------
create function public.advance_order(p_order_id uuid, p_lat double precision default null,
                                     p_lng double precision default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_next text;
begin
  select status into v_status from public.orders where id = p_order_id and driver_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_next := case v_status
    when 'assigned' then 'arrived_pickup'
    when 'arrived_pickup' then 'driving'
    when 'driving' then 'completed'
  end;
  if v_next is null then raise exception 'INVALID_TRANSITION'; end if;
  if v_next = 'driving' and cardinality(public.missing_photos(p_order_id, 'pickup')) > 0 then
    raise exception 'PHOTOS_REQUIRED';
  end if;
  if v_next = 'completed' and cardinality(public.missing_photos(p_order_id, 'dropoff')) > 0 then
    raise exception 'PHOTOS_REQUIRED';
  end if;

  perform public.set_rpc_context(null, p_lat, p_lng);
  update public.orders set status = v_next where id = p_order_id;
  return v_next;
end $$;
