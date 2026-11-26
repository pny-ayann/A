'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isActive } from '@/lib/nav';

/** 왼쪽 메뉴 한 줄. 지금 화면이면 밝은 바탕 + 왼쪽 노란 줄 */
export function NavLink({ href, except, children }: { href: string; except?: string[]; children: ReactNode }) {
  const on = isActive(usePathname(), href, except);
  return (
    <Link href={href} aria-current={on ? 'page' : undefined}
      className={`flex items-center rounded border-l-4 px-2 py-1.5 ${on ? 'border-plate bg-ink-2 font-semibold text-white' : 'border-transparent hover:bg-ink-2'}`}>
      {children}
    </Link>
  );
}
