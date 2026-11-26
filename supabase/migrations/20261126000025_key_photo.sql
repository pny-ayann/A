-- 출발·도착 필수 사진에 차키(key) 한 칸 추가: 5장 → 6장
alter table public.order_photos drop constraint order_photos_slot_check;
alter table public.order_photos add constraint order_photos_slot_check
  check (slot in ('front', 'back', 'left', 'right', 'dashboard', 'key'));

create or replace function public.missing_photos(p_order_id uuid, p_phase text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_out text[];
begin
  if auth.uid() is not null and not public.can_read_order(p_order_id) then
    raise exception 'FORBIDDEN';
  end if;
  select coalesce(array_agg(s order by ord), '{}') into v_out
  from unnest(array['front', 'back', 'left', 'right', 'dashboard', 'key']) with ordinality as t(s, ord)
  where not exists (
    select 1 from public.order_photos p
    join storage.objects so on so.bucket_id = 'order-photos' and so.name = p.path
    where p.order_id = p_order_id and p.phase = p_phase and p.slot = t.s
  );
  return v_out;
end $$;
