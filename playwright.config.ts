import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    colorScheme: "light",
  },
  webServer: {
    command: "node ./node_modules/next/dist/bin/next dev",
    url: `${baseURL}/login`,
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret",
      APP_ENV: process.env.APP_ENV ?? "development",
      DEMO_EMAIL: process.env.DEMO_EMAIL ?? "demo@omnimarket.local",
      DEMO_PASSWORD: process.env.DEMO_PASSWORD ?? "omnimarket",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
