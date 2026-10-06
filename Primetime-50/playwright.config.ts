import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ["--no-sandbox"] } : undefined,
    trace: "off", // Auth links/cookies may contain credentials; don't retain traces by default.
    screenshot: "off"
  },
  projects: [
    { name: "guards", testMatch: "**/guards.spec.ts" },
    { name: "foundation", testMatch: "**/foundation.spec.ts" },
    { name: "foundation-mobile", testMatch: "**/foundation.spec.ts", use: { viewport: { width: 375, height: 812 } } }
  ],
  webServer: { command: "pnpm start --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100/login", timeout: 60000, reuseExistingServer: false, env: { NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100", NEXT_TELEMETRY_DISABLED: "1" } }
});
