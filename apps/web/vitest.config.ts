import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    // VideoDialog mounts a real YouTube <iframe> when played. Without this,
    // happy-dom tries to fetch the embed URL and the aborted request surfaces
    // as an unhandled NetworkError that fails the whole run.
    environmentOptions: {
      happyDOM: {
        settings: { disableIframePageLoading: true },
      },
    },
    setupFiles: ["./src/test-setup.ts"],
    passWithNoTests: true,
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/__tests__/**",
        "src/**/index.ts",
        "src/test-setup.ts",
        "src/routeTree.gen.ts",
      ],
      reporter: ["text", "json-summary", "json"],
    },
  },
});
