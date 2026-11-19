-- 2단계-1: 주유비 지급 (사용자 결정 2026-11-19)
-- 누가 기사에게 주유비를 주는지 업체별 설정. 기본: 현금 오더 = 업체가 현장 지급(장부 없음),
-- 후불 오더 = 상황실 지급(관제 '주유비 청구' 목록 → 건별/한 번에 지급 → 기사 충전금에 즉시).

alter table public.companies
  add column fuel_payer_cash text not null default 'company' check (fuel_payer_cash in ('company', 'office')),
  add column fuel_payer_postpaid text not null default 'office' check (fuel_payer_postpaid in ('company', 'office'));

alter table public.fuel_receipts
  add column paid_at timestamptz,
  add column paid_by uuid references public.profiles(id),
  add column paid_amount int;

-- 이 영수증의 주유비를 상황실이 주는가
create function public.fuel_paid_by_office(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when o.payment_method = 'cash' then c.fuel_payer_cash else c.fuel_payer_postpaid end = 'office'
    from public.orders o join public.companies c on c.id = o.company_id
    where o.id = p_order_id), false)
$$;
revoke execute on function public.fuel_paid_by_office(uuid) from public, anon, authenticated;

-- 관제: 아직 안 준 상황실 지급 주유비
create function public.fuel_claims()
returns table(receipt_id uuid, order_id uuid, order_no text, driver_id uuid, driver_name text,
              company_name text, amount int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  return query
    select r.id, o.id, o.order_no, r.driver_id, p.name, c.name, r.amount, r.created_at
    from public.fuel_receipts r
    join public.orders o on o.id = r.order_id
    join public.companies c on c.id = o.company_id
    left join public.profiles p on p.id = r.driver_id
    where r.paid_at is null and public.fuel_paid_by_office(o.id);
end $$;

create function public.pay_fuel(p_receipt_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_n int := 0;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  for r in
    select f.id, f.driver_id, f.amount, f.order_id, o.order_no
    from public.fuel_receipts f join public.orders o on o.id = f.order_id
    where f.id = any(p_receipt_ids) and f.paid_at is null and public.fuel_paid_by_office(f.order_id)
    for update of f
  loop
    insert into public.wallet_entries(driver_id, amount, kind, label, order_id, ref_id)
    values (r.driver_id, r.amount, 'fuel', '주유비 지급 (' || r.order_no || ')', r.order_id, r.id);
    update public.fuel_receipts set paid_at = now(), paid_by = auth.uid(), paid_amount = r.amount where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 지급한 영수증의 금액이 바뀌거나 지워지면 차이만 장부에
create function public.fuel_receipts_paid_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_no text;
begin
  if tg_op = 'UPDATE' then
    if old.paid_at is not null and new.amount is distinct from old.paid_amount then
      select order_no into v_no from public.orders where id = new.order_id;
      insert into public.wallet_entries(driver_id, amount, kind, label, order_id, ref_id)
      values (old.driver_id, new.amount - old.paid_amount, 'fuel_adjust', '주유비 변경 (' || v_no || ')', new.order_id, new.id);
      new.paid_amount := new.amount;
    end if;
    return new;
  else
    if old.paid_at is not null and old.paid_amount <> 0 then
      select order_no into v_no from public.orders where id = old.order_id;
      insert into public.wallet_entries(driver_id, amount, kind, label, order_id, ref_id)
      values (old.driver_id, -old.paid_amount, 'fuel_adjust', '주유비 변경 (' || coalesce(v_no, '-') || ')', old.order_id, old.id);
    end if;
    return old;
  end if;
end $$;
revoke execute on function public.fuel_receipts_paid_change() from public, anon, authenticated;
create trigger fuel_receipts_paid_change before update or delete on public.fuel_receipts
  for each row execute function public.fuel_receipts_paid_change();
