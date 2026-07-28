import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // lib 純函式測試 + 未來的 route 測試（app/api/**）都跑得到（Codex #12）。
    include: ['lib/**/*.test.ts', 'app/api/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
