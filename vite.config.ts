import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createRuntimeInventoryStore } from "./src/server/runtime-inventory-store";

export default defineConfig({
  plugins: [runtimeInventoryApiPlugin(), react()],
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});

function runtimeInventoryApiPlugin(): Plugin {
  const store = createRuntimeInventoryStore();

  return {
    name: "agentlane-runtime-inventory-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || "/", "http://agentlane.local");

        if (request.method === "GET" && requestUrl.pathname === "/api/runtime-inventory/latest") {
          const snapshot = store.readLatestSnapshot();
          if (!snapshot) {
            sendJson(response, 404, { error: "not_found" });
            return;
          }
          sendJson(response, 200, snapshot);
          return;
        }

        if (request.method === "POST" && requestUrl.pathname === "/api/device-snapshots") {
          try {
            const snapshot = store.writeLatestSnapshot(await readJsonBody(request));
            sendJson(response, 201, {
              ok: true,
              deviceId: snapshot.device.id,
              observedAt: snapshot.observedAt,
            });
          } catch (error) {
            sendJson(response, 400, {
              error: error instanceof Error ? error.message : "invalid snapshot",
            });
          }
          return;
        }

        next();
      });
    },
  };
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
