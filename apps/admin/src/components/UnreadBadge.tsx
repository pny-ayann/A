'use client';
import { totalUnread } from '@/lib/chat/unread';
import { useUnread } from '@/lib/chat/useUnread';

/** 왼쪽 메뉴 "문의" 옆 전체 안 읽은 수 */
export function UnreadBadge() {
  const n = totalUnread(useUnread());
  if (n === 0) return null;
  return <span aria-label={`안 읽은 문의 ${n}개`} className="ml-auto rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{n}</span>;
}
