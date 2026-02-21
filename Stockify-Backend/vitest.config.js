import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["verbose", "junit"],
    outputFile: {
      junit: "./test-reports/junit.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["modules/**/*.js", "Middleware/**/*.js"],
      exclude: ["node_modules/**", "__tests__/**"],
    },
  },
});
