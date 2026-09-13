import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "client/**/*.test.ts"],
  },
});
