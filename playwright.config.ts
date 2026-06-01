import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Reset the test DB in the server command itself (not just globalSetup): it
    // runs after any prior dev server has exited and the port is free, so a
    // leftover WAL from a previous run can't resurrect rows into the fresh DB.
    command: `rm -f knowledge.test.db knowledge.test.db-shm knowledge.test.db-wal knowledge.test.db-journal && DATABASE_PATH=./knowledge.test.db USE_FAKE_AI=1 PORT=${PORT} npm run dev`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
