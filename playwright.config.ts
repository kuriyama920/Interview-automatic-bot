/**
 * Playwright E2E テスト設定
 *
 * Electron デスクトップアプリ用の E2E テスト。
 * ブラウザテスト（マーケティングサイト）とElectronテストの両方をサポート。
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30000,

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'marketing-site',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
      testMatch: '**/marketing.spec.ts',
    },
    {
      name: 'api-integration',
      testMatch: '**/api-integration.spec.ts',
    },
  ],
})
