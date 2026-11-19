-- 고객 알림 빈틈 메우기 (0015 다시 정의)
-- 1) 고객이 스스로 취소하면 같은 업체 다른 고객 계정에 알림 (본인 제외, 누가 취소했는지 이름)
-- 2) 관제가 배차됨 → 운행 중으로 바로 바꿔도 '출발했어요'
-- 3) 관제가 다른 기사로 바꾸면 '기사가 바뀌었어요 · 새 기사' (상태는 그대로 배차됨이라 전에는 안 갔다)

create or replace function public.orders_customer_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_targets uuid[];
  v_title text;
  v_body text;
  v_name text;
begin
  begin
    v_body := public.order_route_text(new) || coalesce(' · ' || nullif(new.vehicle_number, ''), '');

    if new.status is not distinct from old.status then
      -- 같은 상태에서 기사만 바뀜 (관제 재배차). 회수(기사 없음)는 오더가 다시 접수 대기가 되므로 여기 오지 않는다
      if new.status in ('assigned', 'arrived_pickup', 'driving') and old.driver_id is not null
         and new.driver_id is not null and new.driver_id is distinct from old.driver_id then
        select name into v_name from public.profiles where id = new.driver_id;
        v_title := '기사가 바뀌었어요' || coalesce(' · ' || nullif(v_name, ''), '');
      else
        return null;
      end if;
    elsif old.status = 'open' and new.status = 'assigned' then
      select name into v_name from public.profiles where id = new.driver_id;
      v_title := '배차됐어요' || coalesce(' · ' || nullif(v_name, ''), '');
    elsif new.status = 'driving' and old.status in ('assigned', 'arrived_pickup') then
      v_title := '출발했어요';
    elsif new.status = 'completed' then
      v_title := '도착 완료';
    elsif new.status = 'cancelled' and (v_actor is null or public.is_staff()) then
      v_title := '관제가 오더를 취소했어요';
    elsif new.status = 'cancelled' then
      -- 고객이 스스로 취소: 본인은 아래에서 빠지고 동료만 받는다
      select name into v_name from public.profiles where id = v_actor;
      v_title := '오더가 취소됐어요' || coalesce(' · ' || nullif(v_name, ''), '');
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
