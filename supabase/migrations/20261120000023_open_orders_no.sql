-- 기사 공개 오더 목록에 오더 번호 추가 (0008 정의 + order_no). 돌려주는 칸이 바뀌어 지우고 다시 만든다.
drop function public.list_open_orders(double precision, double precision);

create function public.list_open_orders(p_lat double precision default null,
                                        p_lng double precision default null)
returns table(id uuid, order_no text, kind text, reserved_at timestamptz, pickup_area text, dropoff_area text, fare int,
              payment_method text, distance_km double precision, mission_names text[])
language sql stable security definer set search_path = public as $$
  with base as (
    select o.*,
           case when p_lat is not null and p_lng is not null and o.pickup_lat is not null and o.pickup_lng is not null
                then ceil(public.haversine_km(p_lat, p_lng, o.pickup_lat, o.pickup_lng) * 2) / 2 end as km
    from public.orders o
    where public.is_active_driver() and o.status = 'open' and o.dispatch_mode = 'open'
  )
  select b.id, b.order_no, b.kind, b.reserved_at, b.pickup_area, b.dropoff_area, b.fare, b.payment_method, b.km,
         coalesce((select array_agg(m.name order by m.name)
                   from public.order_missions om join public.missions m on m.id = om.mission_id
                   where om.order_id = b.id), '{}')
  from base b
  order by (b.reserved_at is not null),
           case when b.reserved_at is null then b.km end nulls last,
           b.reserved_at,
           b.created_at
$$;
revoke execute on function public.list_open_orders(double precision, double precision) from public, anon;
grant execute on function public.list_open_orders(double precision, double precision) to authenticated;
