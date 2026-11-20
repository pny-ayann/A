-- 사람이 읽는 오더 번호: 접수 날짜(한국) + 그날 순번. 예) 1119-007
-- 고유값은 연도까지 포함한 (order_day, order_seq). order_no는 보여 주는 글자라 해마다 겹쳐도 된다.
-- 서버만 정하고 아무도 고칠 수 없다. 앱에서 접수하면 접수 시각도 서버 시각으로 고정한다.
-- 알림 본문 경로 앞에도 붙인다.

create table public.order_no_counters (
  day date primary key,
  n int not null
);
alter table public.order_no_counters enable row level security; -- 정책 없음: 트리거만 쓴다

alter table public.orders
  add column order_day date,
  add column order_seq int,
  add column order_no text;

-- 기존 오더: 접수 시각 순으로 채운다
with numbered as (
  select id, (created_at at time zone 'Asia/Seoul')::date as day,
         row_number() over (partition by (created_at at time zone 'Asia/Seoul')::date order by created_at, id) as n
  from public.orders
)
update public.orders o
set order_day = x.day, order_seq = x.n,
    order_no = to_char(x.day, 'MMDD') || '-' || lpad(x.n::text, greatest(3, length(x.n::text)), '0')
from numbered x where x.id = o.id;

insert into public.order_no_counters(day, n)
select order_day, max(order_seq) from public.orders group by 1;

alter table public.orders
  alter column order_day set not null,
  alter column order_seq set not null,
  alter column order_no set not null,
  add constraint orders_order_day_seq_key unique (order_day, order_seq);

create function public.orders_set_order_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_day date;
  v_n int;
begin
  -- 앱(로그인한 사용자)이 넣으면 접수 시각은 서버 시각
  if auth.uid() is not null or new.created_at is null then
    new.created_at := now();
  end if;
  v_day := (new.created_at at time zone 'Asia/Seoul')::date;
  insert into public.order_no_counters(day, n) values (v_day, 1)
  on conflict (day) do update set n = public.order_no_counters.n + 1
  returning n into v_n;
  new.order_day := v_day;
  new.order_seq := v_n;
  new.order_no := to_char(v_day, 'MMDD') || '-' || lpad(v_n::text, greatest(3, length(v_n::text)), '0');
  return new;
end $$;
revoke execute on function public.orders_set_order_no() from public, anon, authenticated;
create trigger orders_set_order_no before insert on public.orders
  for each row execute function public.orders_set_order_no();

create function public.orders_keep_order_no() returns trigger
language plpgsql as $$
begin
  new.order_no := old.order_no;
  new.order_day := old.order_day;
  new.order_seq := old.order_seq;
  new.created_at := old.created_at;
  return new;
end $$;
create trigger orders_keep_order_no before update of order_no, order_day, order_seq, created_at on public.orders
  for each row execute function public.orders_keep_order_no();

-- 알림 본문: [번호] 출발 지역 → 도착 지역
create or replace function public.order_route_text(o public.orders) returns text
language sql stable as $$
  select '[' || o.order_no || '] '
      || coalesce(nullif(o.pickup_area, ''), '출발지') || ' → ' || coalesce(nullif(o.dropoff_area, ''), '도착지')
$$;
