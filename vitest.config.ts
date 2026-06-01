import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    setupFiles: ["tests/unit/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` is a Next.js runtime marker that throws when imported in
      // client code. In Node-based unit tests we want it to be a no-op so we
      // can exercise server modules whose DB / network deps are mocked.
      "server-only": path.resolve(__dirname, "tests/unit/server-only-shim.ts"),
    },
  },
});
