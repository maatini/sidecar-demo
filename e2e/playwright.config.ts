import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 20_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.FRONTEND_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "api",
      testMatch: /\/(backend|role-service|opa-policy|envoy)\.spec\.ts/,
    },
    {
      name: "ui",
      testMatch: /\/frontend\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
