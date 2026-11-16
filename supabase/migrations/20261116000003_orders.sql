-- 오더 권한, 수정 가드, 이력, 감사 기록, 자주 쓰는 주소, 고객 RPC
-- RPC 공통 규칙: 시작할 때 set_config('app.rpc','on',true). 필요하면 app.reason, app.lat, app.lng도 설정.

-- RLS ---------------------------------------------------------------------
alter table public.orders enable row level security;
create policy orders_select on public.orders for select using (
  public.is_staff() or company_id = public.my_company_id() or driver_id = auth.uid()
);
create policy orders_insert on public.orders for insert with check (
  public.is_staff()
  or (public.my_role() = 'customer' and company_id = public.my_company_id()
      and status = 'open' and driver_id is null and assigned_at is null)
);
create policy orders_update on public.orders for update
  using (public.is_staff() or company_id = public.my_company_id())
  with check (public.is_staff() or company_id = public.my_company_id());

create function public.can_edit_order_children(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.company_id = public.my_company_id() and o.status = 'open'
  )
$$;

alter table public.order_waypoints enable row level security;
create policy order_waypoints_select on public.order_waypoints for select using (public.can_read_order(order_id));
create policy order_waypoints_write on public.order_waypoints for all
  using (public.can_edit_order_children(order_id)) with check (public.can_edit_order_children(order_id));

alter table public.order_missions enable row level security;
create policy order_missions_select on public.order_missions for select using (public.can_read_order(order_id));
create policy order_missions_write on public.order_missions for all
  using (public.can_edit_order_children(order_id)) with check (public.can_edit_order_children(order_id));

alter table public.order_events enable row level security;
create policy order_events_select on public.order_events for select using (public.can_read_order(order_id));

-- 수정 가드 -----------------------------------------------------------------
create function public.guard_order_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null                                   -- 서버(서비스 키) 작업
     or public.is_staff()
     or current_setting('app.rpc', true) = 'on' then
    return new;
  end if;
  if old.company_id = public.my_company_id()
     and old.status = 'open'
     and new.status = old.status
     and new.company_id = old.company_id
     and new.driver_id is not distinct from old.driver_id
     and new.assigned_at is not distinct from old.assigned_at
     and new.created_by is not distinct from old.created_by then
    return new;
  end if;
  raise exception 'FORBIDDEN';
end $$;
create trigger guard_order_update before update on public.orders
  for each row execute function public.guard_order_update();

-- 이력 ----------------------------------------------------------------------
create function public.ctx_float(p_key text) returns double precision
language sql stable as $$
  select nullif(current_setting(p_key, true), '')::double precision
$$;

create function public.log_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(current_setting('app.reason', true), '');
  v_lat double precision := public.ctx_float('app.lat');
  v_lng double precision := public.ctx_float('app.lng');
  v_changed text[];
begin
  if new.status is distinct from old.status then
    insert into public.order_events(order_id, actor_id, type, from_status, to_status, reason, lat, lng)
    values (new.id, auth.uid(), 'status', old.status, new.status, v_reason, v_lat, v_lng);
  end if;
  if new.fare is distinct from old.fare then
    insert into public.order_events(order_id, actor_id, type, reason, data, lat, lng)
    values (new.id, auth.uid(), 'fare', v_reason, jsonb_build_object('from', old.fare, 'to', new.fare), v_lat, v_lng);
  end if;
  select array_agg(n.key order by n.key) into v_changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('id', 'company_id', 'created_by', 'created_at', 'updated_at',
                      'status', 'fare', 'driver_id', 'assigned_at');
  if v_changed is not null then
    insert into public.order_events(order_id, actor_id, type, reason, data, lat, lng)
    values (new.id, auth.uid(), 'edit', v_reason, to_jsonb(v_changed), v_lat, v_lng);
  end if;
  return new;
end $$;
create trigger log_order_change after update on public.orders
  for each row execute function public.log_order_change();

-- 감사 기록 -------------------------------------------------------------------
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_id text := coalesce(v_new, v_old)->>'id';
begin
  insert into public.audit_log(actor_id, table_name, row_id, action, old_row, new_row)
  values (
    auth.uid(), tg_table_name,
    case when v_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_id::uuid end,
    tg_op, v_old, v_new
  );
  return coalesce(new, old);
end $$;

create trigger audit_orders after insert or update or delete on public.orders
  for each row execute function public.audit_row();
create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.audit_row();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.audit_row();
create trigger audit_fare_bands after insert or update or delete on public.fare_bands
  for each row execute function public.audit_row();
create trigger audit_missions after insert or update or delete on public.missions
  for each row execute function public.audit_row();

-- 자주 쓰는 주소 ----------------------------------------------------------------
create function public.track_addresses() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_addresses as ca
    (company_id, address, detail, area, lat, lng, contact_name, contact_phone, use_count, last_used_at)
  values
    (new.company_id, new.pickup_address, coalesce(new.pickup_detail, ''), new.pickup_area, new.pickup_lat,
     new.pickup_lng, new.pickup_contact_name, new.pickup_contact_phone, 1, now()),
    (new.company_id, new.dropoff_address, coalesce(new.dropoff_detail, ''), new.dropoff_area, new.dropoff_lat,
     new.dropoff_lng, new.dropoff_contact_name, new.dropoff_contact_phone, 1, now())
  on conflict (company_id, address, detail) do update set
    use_count = ca.use_count + 1,
    last_used_at = now(),
    area = coalesce(excluded.area, ca.area),
    lat = coalesce(excluded.lat, ca.lat),
    lng = coalesce(excluded.lng, ca.lng),
    contact_name = coalesce(excluded.contact_name, ca.contact_name),
    contact_phone = coalesce(excluded.contact_phone, ca.contact_phone);
  return new;
end $$;
create trigger track_addresses after insert on public.orders
  for each row
  when (new.pickup_address is distinct from new.dropoff_address
        or coalesce(new.pickup_detail, '') is distinct from coalesce(new.dropoff_detail, ''))
  execute function public.track_addresses();

create function public.top_addresses(p_company_id uuid) returns setof public.company_addresses
language sql stable as $$
  select * from public.company_addresses
  where company_id = p_company_id
  order by pinned desc, use_count desc, last_used_at desc nulls last, created_at
  limit 10
$$;

-- 고객 RPC ----------------------------------------------------------------------
create function public.customer_cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from public.orders
  where id = p_order_id and company_id = public.my_company_id()
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'open' then raise exception 'CANCEL_NOT_ALLOWED'; end if;
  perform set_config('app.rpc', 'on', true);
  update public.orders set status = 'cancelled' where id = p_order_id;
end $$;

create function public.customer_amend_order(
  p_order_id uuid, p_reason text, p_fare int,
  p_dropoff jsonb default null, p_waypoint jsonb default null, p_mission_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_extra int;
begin
  select status into v_status from public.orders
  where id = p_order_id and company_id = public.my_company_id()
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status not in ('assigned', 'arrived_pickup', 'driving') then raise exception 'INVALID_TRANSITION'; end if;
  if p_fare is null or p_fare < 0 then raise exception 'INVALID_AMENDMENT'; end if;

  perform set_config('app.rpc', 'on', true);
  perform set_config('app.reason', p_reason, true);

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
  elsif p_reason = 'waypoint_added' and nullif(p_waypoint->>'address', '') is not null then
    insert into public.order_waypoints(order_id, seq, address, detail, area, lat, lng, contact_name, contact_phone)
    select p_order_id, coalesce(max(seq), 0) + 1, p_waypoint->>'address', p_waypoint->>'detail', p_waypoint->>'area',
           (p_waypoint->>'lat')::double precision, (p_waypoint->>'lng')::double precision,
           p_waypoint->>'contact_name', p_waypoint->>'contact_phone'
    from public.order_waypoints where order_id = p_order_id;
    update public.orders set fare = p_fare where id = p_order_id;
  elsif p_reason = 'mission_added' and p_mission_id is not null then
    select extra_fare into v_extra from public.missions where id = p_mission_id and active;
    if not found then raise exception 'INVALID_AMENDMENT'; end if;
    insert into public.order_missions(order_id, mission_id, extra_fare)
    values (p_order_id, p_mission_id, v_extra)
    on conflict do nothing;
    update public.orders set fare = p_fare where id = p_order_id;
  else
    raise exception 'INVALID_AMENDMENT';
  end if;
end $$;
