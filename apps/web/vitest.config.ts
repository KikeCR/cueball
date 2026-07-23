/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { coverageConfigDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "app/**",
        ".next/**",
        "test/**",
        "**/index.ts",
      ],
    },
  },
});
