import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setBrowserExecutable(
  process.env.REMOTION_BROWSER_EXECUTABLE ??
    "/home/josey/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell",
);
Config.setConcurrency(3);
