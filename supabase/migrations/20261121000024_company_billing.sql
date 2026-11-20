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

-- 입금 체크 ------------------------------------------------------------------
-- 한 줄 = "이 업체의 이 달 정산서를 다 받았다". 체크할 때 청구금액도 함께 저장. 해제 = 삭제.
create table public.company_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  month date not null check (extract(day from month) = 1),
  checked_at timestamptz not null default now(),
  checked_by uuid not null default auth.uid() references public.profiles(id),
  amount int not null,
  unique (company_id, month)
);
alter table public.company_payments enable row level security;
create policy company_payments_select on public.company_payments for select to authenticated using (public.is_admin());
-- 쓰기 정책 없음: set_company_paid로만
create trigger audit_company_payments after insert or update or delete on public.company_payments
  for each row execute function public.audit_row();

create function public.set_company_paid(p_company uuid, p_month date, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_total int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if not p_paid then
    delete from public.company_payments where company_id = p_company and month = v_month;
    return;
  end if;
  select coalesce((select t.total from public.billing_totals(v_month) t where t.company_id = p_company), 0) into v_total;
  insert into public.company_payments(company_id, month, amount) values (p_company, v_month, v_total)
  on conflict (company_id, month) do update
    set amount = excluded.amount, checked_at = now(), checked_by = auth.uid();
end $$;

-- 그 달 업체별 합계 + 입금 체크. 체크 줄만 남은 업체(금액이 0이 됨)도 보인다.
create function public.billing_summary(p_month date)
returns table(company_id uuid, company_name text, supply int, vat int, fuel int, total int, paid_amount int, paid_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.name, coalesce(t.supply, 0), coalesce(t.vat, 0), coalesce(t.fuel, 0), coalesce(t.total, 0),
           p.amount, p.checked_at
    from public.billing_totals(v_month) t
    full join (select * from public.company_payments where month = v_month) p on p.company_id = t.company_id
    join public.companies c on c.id = coalesce(t.company_id, p.company_id)
    order by c.name;
end $$;

-- 미수금: 이번 달(한국 시간) 전의 달 중 덜 받은 돈. 미입금이면 청구금액 전부, 체크 뒤 늘었으면 그 차액.
create function public.billing_receivables()
returns table(company_id uuid, company_name text, month date, total int, paid_amount int, due int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_now date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_m date;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  for v_m in
    select distinct date_trunc('month', o.completed_at at time zone 'Asia/Seoul')::date
      from public.orders o
      where o.payment_method = 'postpaid' and o.status = 'completed' and o.completed_at is not null
    union
    select p.month from public.company_payments p
    order by 1
  loop
    continue when v_m >= v_now;
    return query
      select s.company_id, s.company_name, v_m, s.total, s.paid_amount, s.total - coalesce(s.paid_amount, 0)
      from public.billing_summary(v_m) s
      where s.total - coalesce(s.paid_amount, 0) > 0;
  end loop;
end $$;

grant execute on function public.set_company_paid(uuid, date, boolean), public.billing_summary(date),
  public.billing_receivables() to authenticated;
