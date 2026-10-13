import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 8 * 60 * 1000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: process.env.ATOMS_E2E_BASE_URL || "http://localhost:3000",
    headless: process.env.HEADLESS === "true",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    viewport: { width: 1470, height: 801 },
  },
});
