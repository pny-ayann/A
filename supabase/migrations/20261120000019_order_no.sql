-- 사람이 읽는 오더 번호: 접수 날짜(한국) + 그날 순번. 예) 1119-007
-- 서버만 정하고 아무도 고칠 수 없다. 알림 본문 경로 앞에도 붙인다.

create table public.order_no_counters (
  day date primary key,
  n int not null
);
alter table public.order_no_counters enable row level security; -- 정책 없음: 트리거만 쓴다

alter table public.orders add column order_no text;

-- 기존 오더: 접수 시각 순으로 채운다
with numbered as (
  select id, (created_at at time zone 'Asia/Seoul')::date as day,
         row_number() over (partition by (created_at at time zone 'Asia/Seoul')::date order by created_at, id) as n
  from public.orders
)
update public.orders o
set order_no = to_char(x.day, 'MMDD') || '-' || lpad(x.n::text, greatest(3, length(x.n::text)), '0')
from numbered x where x.id = o.id;

insert into public.order_no_counters(day, n)
select (created_at at time zone 'Asia/Seoul')::date, count(*) from public.orders group by 1;

alter table public.orders alter column order_no set not null;
alter table public.orders add constraint orders_order_no_key unique (order_no);

create function public.orders_set_order_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_day date := (coalesce(new.created_at, now()) at time zone 'Asia/Seoul')::date;
  v_n int;
begin
  insert into public.order_no_counters(day, n) values (v_day, 1)
  on conflict (day) do update set n = public.order_no_counters.n + 1
  returning n into v_n;
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
  return new;
end $$;
create trigger orders_keep_order_no before update of order_no on public.orders
  for each row execute function public.orders_keep_order_no();

-- 알림 본문: [번호] 출발 지역 → 도착 지역
create or replace function public.order_route_text(o public.orders) returns text
language sql stable as $$
  select '[' || o.order_no || '] '
      || coalesce(nullif(o.pickup_area, ''), '출발지') || ' → ' || coalesce(nullif(o.dropoff_area, ''), '도착지')
$$;
