import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Two groups, run one after another: `main` (unit, CLI and the real-Chrome
 * suites), then `conformance` — orz-markdown's carrier conformance harness
 * against the real carrier (tests/conformance.test.ts, minutes of Chrome
 * load), so its load never shares the machine with the other suites' timing.
 * `tests/global-setup.ts` stages the browser engine into dist/ first (the
 * Node library and the CLI inline it). Real-Chrome tests (playwright-core,
 * channel 'chrome') skip themselves when Chrome is not installed; such a run
 * does not verify the claims marked "real" in notes/CLAIMS.md.
 */
const HEAVY = ['tests/conformance.test.ts'];

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      { extends: true, test: { name: 'main', include: ['tests/**/*.test.ts'], exclude: [...configDefaults.exclude, ...HEAVY], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'conformance', include: HEAVY, sequence: { groupOrder: 1 } } },
    ],
  },
});
