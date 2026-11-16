import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@takson/shared'],
  // 개발 서버 표시(N 아이콘)가 왼쪽 아래 로그아웃 버튼을 가려서 오른쪽으로 옮긴다
  devIndicators: { position: 'bottom-right' },
};

export default config;
