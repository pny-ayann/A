-- 관제 조작: 강제 배차, 회수, 상태 변경
-- 관제의 일반 항목 수정은 orders 직접 update (가드가 허용, 이력과 감사 기록이 남음)

create function public.staff_assign(p_order_id uuid, p_driver_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_warnings text[];
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status not in ('open', 'assigned') then raise exception 'INVALID_TRANSITION'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver' and driver_status = 'active') then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  v_warnings := public.driver_conflicts(p_driver_id, v_order.reserved_at, p_order_id);
  perform public.set_rpc_context(null, null, null);
  update public.orders set status = 'assigned', driver_id = p_driver_id, assigned_at = now() where id = p_order_id;
  if v_order.driver_id is not null and v_order.driver_id <> p_driver_id then
    insert into public.order_events(order_id, actor_id, type, data)
    values (p_order_id, auth.uid(), 'reassigned', jsonb_build_object('from', v_order.driver_id, 'to', p_driver_id));
  end if;
  return v_warnings;
end $$;

create function public.staff_unassign(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status not in ('assigned', 'arrived_pickup', 'driving') then raise exception 'INVALID_TRANSITION'; end if;

  perform public.set_rpc_context(v_reason, null, null);
  update public.orders set status = 'open', driver_id = null, assigned_at = null where id = p_order_id;
  insert into public.order_events(order_id, actor_id, type, reason) values (p_order_id, auth.uid(), 'unassigned', v_reason);
end $$;

create function public.staff_set_status(p_order_id uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_missing jsonb := '{}'::jsonb;
  v_pickup text[];
  v_dropoff text[];
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_status not in ('open', 'assigned', 'arrived_pickup', 'driving', 'completed', 'cancelled') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status in ('assigned', 'arrived_pickup', 'driving', 'completed') and v_order.driver_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_status in ('driving', 'completed') then
    v_pickup := public.missing_photos(p_order_id, 'pickup');
    if cardinality(v_pickup) > 0 then v_missing := v_missing || jsonb_build_object('pickup', to_jsonb(v_pickup)); end if;
  end if;
  if p_status = 'completed' then
    v_dropoff := public.missing_photos(p_order_id, 'dropoff');
    if cardinality(v_dropoff) > 0 then v_missing := v_missing || jsonb_build_object('dropoff', to_jsonb(v_dropoff)); end if;
  end if;
  if (p_status = 'cancelled' or v_missing <> '{}'::jsonb) and v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;

  perform public.set_rpc_context(v_reason, null, null);
  if p_status = 'open' then
    update public.orders set status = 'open', driver_id = null, assigned_at = null where id = p_order_id;
  else
    update public.orders set status = p_status where id = p_order_id;
  end if;
  if v_missing <> '{}'::jsonb then
    insert into public.order_events(order_id, actor_id, type, reason, data)
    values (p_order_id, auth.uid(), 'photo_override', v_reason, jsonb_build_object('missing', v_missing));
  end if;
end $$;
