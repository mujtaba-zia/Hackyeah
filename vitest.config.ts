import { defineConfig } from "vitest/config";

// Node by default; browser-facing test files opt in with
// `// @vitest-environment jsdom` on their first line.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
