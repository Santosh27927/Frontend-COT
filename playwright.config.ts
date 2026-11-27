import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const demoDataDir = mkdtempSync(join(tmpdir(), "cot-browser-tests-"));
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      COT_DEMO_DATA_DIR: demoDataDir,
      COT_NEXT_DIST_DIR: ".next-test",
    },
  },
});
