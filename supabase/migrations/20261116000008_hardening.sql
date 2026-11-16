-- 최종 검토에서 나온 우회 경로 막기

-- 1. 사진·영수증은 정해진 폴더 경로여야 하고, 사진은 실제 파일이 있어야 '올린 것'으로 친다 ----------
alter table public.order_photos
  add constraint order_photos_path_check check (path like order_id::text || '/' || phase || '/%');
alter table public.fuel_receipts
  add constraint fuel_receipts_path_check check (path like order_id::text || '/%');

create function public.stamp_uploader() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
  end if;
  return new;
end $$;
create trigger stamp_uploader before insert or update on public.order_photos
  for each row execute function public.stamp_uploader();

create or replace function public.missing_photos(p_order_id uuid, p_phase text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_out text[];
begin
  if auth.uid() is not null and not public.can_read_order(p_order_id) then
    raise exception 'FORBIDDEN';
  end if;
  select coalesce(array_agg(s order by ord), '{}') into v_out
  from unnest(array['front', 'back', 'left', 'right', 'dashboard']) with ordinality as t(s, ord)
  where not exists (
    select 1 from public.order_photos p
    join storage.objects so on so.bucket_id = 'order-photos' and so.name = p.path
    where p.order_id = p_order_id and p.phase = p_phase and p.slot = t.s
  );
  return v_out;
end $$;

-- 2. 예약 오더라도 출발지 도착이나 운행 중이면 '진행 중인 오더'로 친다. 남의 충돌 정보는 못 본다 ---
create or replace function public.driver_conflicts(p_driver_id uuid, p_reserved_at timestamptz,
                                                   p_exclude_order uuid default null)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_gap interval := make_interval(mins => (select reservation_gap_min from public.settings where id = 1));
  v_out text[] := '{}';
  v_busy boolean;
begin
  if auth.uid() is not null and not (public.is_staff() or p_driver_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  -- 지금 실제로 몸이 묶여 있는 오더: 일반 오더 전부, 또는 출발지 도착/운행 중인 예약 오더
  select exists (
    select 1 from public.orders where driver_id = p_driver_id
      and status in ('assigned', 'arrived_pickup', 'driving')
      and id is distinct from p_exclude_order
      and (reserved_at is null or status in ('arrived_pickup', 'driving'))
  ) into v_busy;

  if p_reserved_at is null then
    if v_busy then
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
       or (p_reserved_at < now() + v_gap and v_busy) then
      v_out := array_append(v_out, 'RESERVATION_CONFLICT');
    end if;
  end if;
  return v_out;
end $$;

-- 3. 공개 목록 거리는 0.5km 단위로 올림 (정확한 출발지 좌표를 역산하지 못하게) ------------------
create or replace function public.list_open_orders(p_lat double precision default null,
                                                   p_lng double precision default null)
returns table(id uuid, kind text, reserved_at timestamptz, pickup_area text, dropoff_area text, fare int,
              payment_method text, distance_km double precision, mission_names text[])
language sql stable security definer set search_path = public as $$
  with base as (
    select o.*,
           case when p_lat is not null and p_lng is not null and o.pickup_lat is not null and o.pickup_lng is not null
                then ceil(public.haversine_km(p_lat, p_lng, o.pickup_lat, o.pickup_lng) * 2) / 2 end as km
    from public.orders o
    where public.is_active_driver() and o.status = 'open' and o.dispatch_mode = 'open'
  )
  select b.id, b.kind, b.reserved_at, b.pickup_area, b.dropoff_area, b.fare, b.payment_method, b.km,
         coalesce((select array_agg(m.name order by m.name)
                   from public.order_missions om join public.missions m on m.id = om.mission_id
                   where om.order_id = b.id), '{}')
  from base b
  order by (b.reserved_at is not null),
           case when b.reserved_at is null then b.km end nulls last,
           b.reserved_at,
           b.created_at
$$;

-- 4. 상태, 배정 기사, 배정 시각은 관제도 RPC로만 바꾼다 (사유와 사진 예외 기록이 남게).
--    고객은 관제 배차 전용 여부와 접수자를 바꿀 수 없다 ----------------------------------------
create or replace function public.guard_order_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or current_setting('app.rpc', true) = 'on' then
    return new;
  end if;
  if public.is_staff() then
    if new.status is distinct from old.status
       or new.driver_id is distinct from old.driver_id
       or new.assigned_at is distinct from old.assigned_at then
      raise exception 'FORBIDDEN';
    end if;
    return new;
  end if;
  if old.company_id = public.my_company_id()
     and old.status = 'open'
     and new.status = old.status
     and new.company_id = old.company_id
     and new.dispatch_mode = old.dispatch_mode
     and new.driver_id is not distinct from old.driver_id
     and new.assigned_at is not distinct from old.assigned_at
     and new.created_by is not distinct from old.created_by then
    return new;
  end if;
  raise exception 'FORBIDDEN';
end $$;

drop policy orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (
  public.is_staff()
  or (public.my_role() = 'customer' and company_id = public.my_company_id()
      and status = 'open' and driver_id is null and assigned_at is null
      and dispatch_mode = 'open' and created_by = auth.uid())
);

-- 5. 로그인하지 않은 사용자(anon)는 함수를 부를 수 없다 ---------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.set_rpc_context(text, double precision, double precision) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
