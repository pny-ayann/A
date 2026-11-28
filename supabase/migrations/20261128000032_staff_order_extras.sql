-- 관제가 어떤 상태의 오더든 경유지·미션을 한 번에 바꾼다 (중간에 실패하면 아무것도 바뀌지 않음).
-- null이면 그 부분은 그대로. 이미 붙은 미션은 그때 요금 유지, 새로 붙이는 미션은 지금 쓰는 미션만·지금 요금.
create function public.staff_set_order_extras(p_order_id uuid, p_waypoints jsonb, p_mission_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_mission_ids, '{}')) x);
  v_changed text[] := '{}';
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_waypoints is not null then
    delete from public.order_waypoints where order_id = p_order_id;
    insert into public.order_waypoints(order_id, seq, address, detail, area, lat, lng, contact_name, contact_phone)
    select p_order_id, x.n, x.w->>'address', x.w->>'detail', x.w->>'area',
           (x.w->>'lat')::double precision, (x.w->>'lng')::double precision, x.w->>'contact_name', x.w->>'contact_phone'
    from jsonb_array_elements(p_waypoints) with ordinality as x(w, n);
    v_changed := v_changed || 'waypoints'::text;
  end if;

  if p_mission_ids is not null then
    if exists (select 1 from unnest(v_ids) i
               where not exists (select 1 from public.order_missions om where om.order_id = p_order_id and om.mission_id = i)
                 and not exists (select 1 from public.missions m where m.id = i and m.active)) then
      raise exception 'INVALID_MISSION';
    end if;
    delete from public.order_missions where order_id = p_order_id and mission_id <> all(v_ids);
    insert into public.order_missions(order_id, mission_id, extra_fare)
    select p_order_id, m.id, m.extra_fare from public.missions m
    where m.id = any(v_ids)
      and not exists (select 1 from public.order_missions om where om.order_id = p_order_id and om.mission_id = m.id);
    v_changed := v_changed || 'missions'::text;
  end if;

  if cardinality(v_changed) > 0 then
    insert into public.order_events(order_id, actor_id, type, data)
    values (p_order_id, auth.uid(), 'edit', to_jsonb(v_changed));
  end if;
end $$;
revoke execute on function public.staff_set_order_extras(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.staff_set_order_extras(uuid, jsonb, uuid[]) to authenticated;
