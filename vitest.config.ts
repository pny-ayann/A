import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['supabase/tests/**/*.test.ts', 'packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
