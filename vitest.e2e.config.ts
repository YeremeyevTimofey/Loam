import { defineConfig } from 'vitest/config';

// End-to-end tests drive the production build in real browsers. Run `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
