import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 90_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "fa-IR",
  },
  projects: [
    {
      name: "chromium",
      use: process.env.CI ? { ...devices["Desktop Chrome"] } : { channel: "chrome" },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : [
        {
          command: "npm run dev",
          cwd: "../backend",
          url: `${apiBase}/api/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            VITE_API_BASE: `${apiBase}/api`,
          },
        },
      ],
});
