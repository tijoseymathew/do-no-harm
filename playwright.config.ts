import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3102",
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    video: { mode: "on", size: { width: 1280, height: 720 } },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    env: { PORT: "3102" },
    url: "http://127.0.0.1:3102/api/health",
    reuseExistingServer: false,
  },
});
