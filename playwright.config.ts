import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 20_000,
  use: {
    baseURL: 'http://127.0.0.1:1422',
    // Reuse installed Chrome; PW_EXECUTABLE points at another Chromium (e.g. in CI or a sandbox).
    // PW_CHROMIUM=1 uses Playwright's own Chromium (CI).
    ...(process.env.PW_EXECUTABLE ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE } } : process.env.PW_CHROMIUM ? {} : { channel: 'chrome' }),
    headless: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 1422',
    url: 'http://127.0.0.1:1422',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
