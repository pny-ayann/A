-- 고객(업체) 앱 푸시 알림 (설계 7.3: 배차·출발·도착 완료 같은 상태 변화는 푸시로)
-- 받는 사람: 그 오더 업체의 고객 계정 전부 (행동한 본인 제외).
-- 0014와 같이 관제 메시지 내용은 알림에 넣지 않는다 (잠금화면에 보이므로).
-- 푸시가 실패해도 상태 변경·메시지 저장은 막지 않는다.

-- 업체의 고객 계정들 (트리거 전용)
create function public.company_customer_ids(p_company_id uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from public.profiles
  where role = 'customer' and company_id = p_company_id
$$;
revoke execute on function public.company_customer_ids(uuid) from public, anon, authenticated;

create function public.orders_customer_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_targets uuid[];
  v_title text;
  v_body text;
  v_driver text;
begin
  begin
    if new.status is not distinct from old.status then
      return null;
    end if;

    v_body := public.order_route_text(new) || coalesce(' · ' || nullif(new.vehicle_number, ''), '');

    if old.status = 'open' and new.status = 'assigned' then
      select name into v_driver from public.profiles where id = new.driver_id;
      v_title := '배차됐어요' || coalesce(' · ' || nullif(v_driver, ''), '');
    elsif new.status = 'driving' and old.status = 'arrived_pickup' then
      v_title := '출발했어요';
    elsif new.status = 'completed' then
      v_title := '도착 완료';
    elsif new.status = 'cancelled' and (v_actor is null or public.is_staff()) then
      -- 고객이 스스로 취소한 것은 알리지 않는다
      v_title := '관제가 오더를 취소했어요';
    else
      return null;
    end if;

    v_targets := array(
      select x from unnest(public.company_customer_ids(new.company_id)) x
      where x is distinct from v_actor
    );
    if cardinality(v_targets) > 0 then
      perform public.send_push(v_targets, v_title, v_body,
        jsonb_build_object('orderId', new.id, 'screen', 'order'));
    end if;
  exception when others then
    raise warning 'orders_customer_push failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.orders_customer_push() from public, anon, authenticated;

create trigger orders_customer_push after update on public.orders
  for each row execute function public.orders_customer_push();

create function public.messages_customer_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_targets uuid[];
begin
  begin
    if new.thread = 'customer' and exists (select 1 from public.profiles where id = new.sender_id and role = 'staff') then
      select company_id into v_company from public.orders where id = new.order_id;
      v_targets := array(
        select x from unnest(public.company_customer_ids(v_company)) x where x <> new.sender_id
      );
      if cardinality(v_targets) > 0 then
        perform public.send_push(v_targets, '관제 메시지', '관제에서 메시지가 왔어요',
          jsonb_build_object('orderId', new.order_id, 'screen', 'chat'));
      end if;
    end if;
  exception when others then
    raise warning 'messages_customer_push failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.messages_customer_push() from public, anon, authenticated;

create trigger messages_customer_push after insert on public.messages
  for each row execute function public.messages_customer_push();
