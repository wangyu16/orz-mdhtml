import { defineConfig } from 'vitest/config';

/**
 * One suite. Real-Chrome tests (playwright-core, channel 'chrome') skip
 * themselves when Chrome is not installed; such a run does not verify the
 * claims marked "real" in notes/CLAIMS.md.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
