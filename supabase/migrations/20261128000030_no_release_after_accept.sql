-- 기사가 '오더수락'을 누른 뒤(수락함)에는 기사가 직접 반납(취소)할 수 없다. 관제 회수·취소는 그대로.
create or replace function public.release_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_window int;
begin
  select * into v_order from public.orders where id = p_order_id and driver_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status = 'arrived_pickup' then raise exception 'ACCEPTED_NO_RELEASE'; end if;
  if v_order.status <> 'assigned' then raise exception 'INVALID_TRANSITION'; end if;
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
