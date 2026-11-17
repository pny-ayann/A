import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: '탁송 관제' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
