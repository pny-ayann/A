'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

let client: ReturnType<typeof createBrowserClient> | undefined;

/** 브라우저용 (로그인한 직원 권한, 실시간 구독에 사용) */
export function browserClient() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
