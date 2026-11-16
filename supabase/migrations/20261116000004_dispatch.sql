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
      v_out := v_out || 'HAS_ACTIVE_ORDER';
    end if;
    if exists (select 1 from public.orders where driver_id = p_driver_id
               and status in ('assigned', 'arrived_pickup', 'driving')
               and id is distinct from p_exclude_order and reserved_at is not null
               and abs(extract(epoch from reserved_at - now())) < extract(epoch from v_gap)) then
      v_out := v_out || 'RESERVATION_CONFLICT';
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
      v_out := v_out || 'RESERVATION_CONFLICT';
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
