import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // lib 純函式測試 + 未來的 route 測試（app/api/**）都跑得到（Codex #12）；
    // 根目錄 middleware.test.ts 是 fix/signoff-magic-hardening 新增，middleware.ts
    // 本身就在根目錄，測試放同一層方便對照。
    include: ['lib/**/*.test.ts', 'app/api/**/*.test.ts', '*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
