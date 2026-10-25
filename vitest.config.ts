import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
    coverage: {
      provider: 'v8',
    },
  },
});
