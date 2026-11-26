-- 서류탁송은 관제(직원)만 접수·전환할 수 있다. 고객 앱·직접 요청 어느 길로 와도 막는다.
-- auth.uid()가 없는 서버 작업(서비스 키·관리 스크립트)은 그대로 둔다.
create or replace function public.orders_capital_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind = 'docs' then
    if auth.uid() is not null and not public.is_staff()
       and (tg_op = 'INSERT' or old.kind is distinct from 'docs') then
      raise exception 'DOCS_STAFF_ONLY';
    end if;
    if new.capital_company_id is null then raise exception 'CAPITAL_REQUIRED'; end if;
  else
    new.capital_company_id := null;
  end if;
  return new;
end $$;
