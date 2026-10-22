import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  // Next preserves JSX; Node component checks need the installed Vite transformer.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)) } },
  test: { projects: [
    { extends: true, test: { name: "security", include: ["tests/security/**/*.test.ts"] } },
    { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
    { extends: true, test: { name: "integration", include: ["tests/integration/**/*.test.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 } }
  ] }
});
