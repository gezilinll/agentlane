import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist/backend",
    rollupOptions: {
      external: ["pg", "ws"],
      output: {
        entryFileNames: "backend-server.mjs",
        format: "es",
      },
    },
    ssr: "src/backend/backend-server.ts",
    target: "node22",
  },
});
