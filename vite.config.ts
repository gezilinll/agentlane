import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const backendUrl = process.env.LORUME_BACKEND_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
