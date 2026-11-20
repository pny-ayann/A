-- 2단계-2 업체 월말 정산: 정산서 줄·합계는 저장하지 않고 오더에서 그때그때 계산한다.
-- 줄은 billing_lines_all 하나에서만 나오고, 합계·화면·엑셀·입금 체크·미수금이 모두 이것을 쓴다.
-- 달은 한국 시간(Asia/Seoul) 기준. 관리자만.

-- 그 달(한국 시간) 모든 업체의 정산서 줄. 내부용: 관리자 검사는 부르는 쪽에서.
create function public.billing_lines_all(p_month date)
returns table(company_id uuid, order_id uuid, order_no text, completed_at timestamptz, pickup_area text,
              dropoff_area text, vehicle_number text, missions text, fare int, fuel int)
language sql stable security definer set search_path = public as $$
  with r as (
    select (date_trunc('month', p_month)::timestamp at time zone 'Asia/Seoul') as s,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Seoul') as e
  ), x as (
    select o.company_id, o.id, o.order_no, o.completed_at, o.pickup_area, o.dropoff_area, o.vehicle_number,
           coalesce((select string_agg(m.name, ', ' order by m.name)
                     from public.order_missions om join public.missions m on m.id = om.mission_id
                     where om.order_id = o.id), '') as missions,
           o.fare,
           case when c.fuel_billing = 'customer' and c.fuel_payer_postpaid = 'office'
                then coalesce((select sum(f.amount) from public.fuel_receipts f where f.order_id = o.id), 0)::int
                else 0 end as fuel
    from public.orders o join public.companies c on c.id = o.company_id, r
    where o.payment_method = 'postpaid' and o.status = 'completed'
      and o.completed_at >= r.s and o.completed_at < r.e
  )
  select * from x where fare + fuel > 0
$$;
revoke execute on function public.billing_lines_all(date) from public, anon, authenticated;

-- 업체 하나의 그 달 정산서 줄 (완료 시각 순)
create function public.billing_lines(p_company uuid, p_month date)
returns table(order_id uuid, order_no text, completed_at timestamptz, pickup_area text, dropoff_area text,
              vehicle_number text, missions text, fare int, fuel int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select l.order_id, l.order_no, l.completed_at, l.pickup_area, l.dropoff_area, l.vehicle_number, l.missions, l.fare, l.fuel
    from public.billing_lines_all(p_month) l where l.company_id = p_company
    order by l.completed_at, l.order_no;
end $$;

-- 그 달 업체별 합계. 부가세는 공급가액에 한 번, 원 미만 버림. 주유비는 실비로 따로 더한다.
create function public.billing_totals(p_month date)
returns table(company_id uuid, company_name text, supply int, vat int, fuel int, total int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    with s as (
      select l.company_id, sum(l.fare)::int as supply, sum(l.fuel)::int as fuel
      from public.billing_lines_all(p_month) l group by l.company_id
    )
    select s.company_id, c.name, s.supply, (s.supply * 10 / 100), s.fuel, s.supply + (s.supply * 10 / 100) + s.fuel
    from s join public.companies c on c.id = s.company_id
    order by c.name;
end $$;

grant execute on function public.billing_lines(uuid, date), public.billing_totals(date) to authenticated;
