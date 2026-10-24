import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@domain": new URL("./src/domain", import.meta.url).pathname,
      "@application": new URL("./src/application", import.meta.url).pathname,
      "@infrastructure": new URL("./src/infrastructure", import.meta.url).pathname,
      "@presentation": new URL("./src/presentation", import.meta.url).pathname,
      "@lib": new URL("./src/lib", import.meta.url).pathname,
    },
  },
});
