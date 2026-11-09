import { defineConfig } from '@playwright/test'

const development = process.env.ROS_E2E_DEV === '1'
const port = development ? 5178 : 4178
const baseURL = 'http://127.0.0.1:' + port

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: development
      ? 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort'
      : 'npm run build && npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
    url: baseURL,
    reuseExistingServer: development,
  },
})
