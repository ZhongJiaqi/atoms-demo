import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

if (process.env.ATOMS_E2E_SKIP_LOCAL_ENV !== "1" && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const productionProxy = process.env.ATOMS_E2E_BASE_URL === "https://atoms-demo-jiaqi.vercel.app"
  ? process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY
  : undefined;

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
    ...(productionProxy ? { proxy: { server: productionProxy } } : {}),
    baseURL: process.env.ATOMS_E2E_BASE_URL || "http://localhost:3000",
    headless: process.env.HEADLESS === "true",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    viewport: { width: 1470, height: 801 },
  },
});
