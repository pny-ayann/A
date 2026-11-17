import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { UnreadBadge } from '@/components/UnreadBadge';
import { getStaffProfile } from '@/lib/supabase/server';
import { logout } from '../login/actions';

const staffMenu = [
  { href: '/orders', label: '오더 관제판' },
  { href: '/orders/new', label: '오더 접수' },
];
const adminMenu = [
  { href: '/admin/companies', label: '업체 관리' },
  { href: '/admin/drivers', label: '기사 관리' },
  { href: '/admin/staff', label: '직원 계정' },
  { href: '/admin/fares', label: '요금표·미션' },
  { href: '/admin/settings', label: '운영 설정' },
  { href: '/admin/audit', label: '변경 기록' },
];

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const me = await getStaffProfile();
  if (!me) redirect('/login');
  const isAdmin = me.staff_level === 'admin';
  return (
    <div className="flex min-h-screen">
      <nav className="flex w-52 shrink-0 flex-col bg-slate-800 p-4 text-slate-100">
        <div className="mb-6 text-lg font-bold">탁송 관제</div>
        {staffMenu.map(m => <Link key={m.href} href={m.href} className="rounded px-2 py-1.5 hover:bg-slate-700">{m.label}</Link>)}
        <Link href="/inquiries" className="flex items-center rounded px-2 py-1.5 hover:bg-slate-700">문의<UnreadBadge /></Link>
        {isAdmin && (
          <>
            <div className="mt-6 mb-1 px-2 text-xs text-slate-400">관리자</div>
            {adminMenu.map(m => <Link key={m.href} href={m.href} className="rounded px-2 py-1.5 hover:bg-slate-700">{m.label}</Link>)}
          </>
        )}
        <div className="mt-auto pt-6 text-sm">
          <div>{me.name}</div>
          <div className="text-xs text-slate-400">{isAdmin ? '관리자' : '일반 관제'}</div>
          <form action={logout}><button className="mt-2 text-xs text-slate-300 underline">로그아웃</button></form>
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
