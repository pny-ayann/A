-- 기사 앱 푸시 알림 (Expo 푸시 서버로 보냄)
-- 오더·메시지가 바뀔 때 트리거가 send_push를 부르고, send_push는 pg_net으로 Expo에 요청을 보낸다.
-- 푸시가 실패해도 배차·저장은 절대 막지 않는다(트리거 안에서 오류를 경고로 바꿈).

-- 실제 Supabase에는 pg_net이 있다. (테스트 DB에는 없어서 stubs.sql이 net.http_post를 흉내 낸다)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- 사람들에게 알림 보내기. 토큰을 모아 100개씩 끊어 보낸다. data에는 화면 이동에 필요한 것만.
create function public.send_push(p_user_ids uuid[], p_title text, p_body text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_batch jsonb;
begin
  for v_batch in
    select jsonb_agg(jsonb_build_object(
             'to', t.token, 'title', p_title, 'body', p_body, 'data', p_data,
             'sound', 'default', 'channelId', 'default', 'priority', 'high'))
    from (
      select token, (row_number() over (order by token) - 1) / 100 as grp
      from public.push_tokens
      where user_id = any(p_user_ids)
    ) t
    group by t.grp
    order by t.grp
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_batch,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end loop;
end $$;

-- 트리거 전용: 앱에서 직접 부를 수 없다
revoke execute on function public.send_push(uuid[], text, text, jsonb) from public, anon, authenticated;

create function public.won_text(p int) returns text
language sql immutable as $$ select to_char(p, 'FM999,999,999,990') || '원' $$;

-- 출발 지역 → 도착 지역
create function public.order_route_text(o public.orders) returns text
language sql stable as $$
  select coalesce(nullif(o.pickup_area, ''), '출발지') || ' → ' || coalesce(nullif(o.dropoff_area, ''), '도착지')
$$;

create function public.orders_push() returns trigger
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

      -- ③ 배정된 기사가 있는 오더의 요금 변경 → 그 기사
      if new.fare <> old.fare and new.driver_id is not null and new.driver_id is distinct from v_actor
         and new.status in ('assigned', 'arrived_pickup', 'driving') then
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

create trigger orders_push after insert or update on public.orders
for each row execute function public.orders_push();

create function public.messages_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid;
begin
  begin
    if new.thread = 'driver' and exists (select 1 from public.profiles where id = new.sender_id and role = 'staff') then
      select driver_id into v_driver from public.orders where id = new.order_id;
      if v_driver is not null then
        perform public.send_push(array[v_driver], '관제 메시지', left(new.body, 100),
          jsonb_build_object('orderId', new.order_id, 'screen', 'chat'));
      end if;
    end if;
  exception when others then
    raise warning 'messages_push failed: %', sqlerrm;
  end;
  return null;
end $$;

create trigger messages_push after insert on public.messages
for each row execute function public.messages_push();

revoke execute on function public.orders_push() from public, anon, authenticated;
revoke execute on function public.messages_push() from public, anon, authenticated;
