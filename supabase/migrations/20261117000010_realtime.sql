-- 관제 웹과 앱이 새로고침 없이 바뀐 내용을 받도록 실시간 발행에 넣는다.
-- 실시간 전달도 RLS를 따르므로, 볼 권한이 없는 행은 전달되지 않는다.
alter publication supabase_realtime
  add table public.orders, public.order_events, public.messages, public.driver_locations;
