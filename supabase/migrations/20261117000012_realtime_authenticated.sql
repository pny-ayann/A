-- 실시간 표의 권한 규칙을 '로그인한 사람(authenticated)'에게만 적용한다.
-- 실시간 서버는 구독자마다 그 사람 역할로 읽기 규칙을 검사하는데, 로그인 전(anon) 구독자를 검사하다
-- 권한 도우미 함수(anon 실행권한 회수됨)에서 오류가 나면 같은 변경을 기다리던 모든 구독자에게 전달이 멈췄다.
-- 규칙이 anon에게 아예 적용되지 않으면 anon은 오류 없이 0줄을 보게 된다(RLS 기본 거부).
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_events', 'messages', 'driver_locations')
      and roles = '{public}'
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
