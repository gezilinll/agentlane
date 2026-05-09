import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { WebSocketServer } from "ws";
import { createRuntimeControlChannel, type RuntimeControlSocket } from "./src/server/runtime-control-channel";
import { createRuntimeHttpApiHandler } from "./src/server/runtime-http-api";
import { createRuntimeInventoryStore } from "./src/server/runtime-inventory-store";
import { createRuntimeWorkStateStore } from "./src/server/runtime-work-state-store";

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
  const workStateStore = createRuntimeWorkStateStore();
  const controlChannel = createRuntimeControlChannel({ store });
  const httpHandler = createRuntimeHttpApiHandler({ store, controlChannel, workStateStore });
  const webSocketServer = new WebSocketServer({ noServer: true });

  return {
    name: "agentlane-runtime-inventory-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void httpHandler(request, response, next);
      });

      server.httpServer?.on("upgrade", (request, socket, head) => {
        const requestUrl = new URL(request.url || "/", "http://agentlane.local");
        if (requestUrl.pathname !== "/api/device-control/ws") return;

        webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
          const controlSocket: RuntimeControlSocket = {
            send(data) {
              if (webSocket.readyState === webSocket.OPEN) webSocket.send(data);
            },
          };
          controlChannel.attach(controlSocket);
          webSocket.on("message", (message) => {
            try {
              controlChannel.receive(controlSocket, message.toString());
            } catch (error) {
              controlSocket.send(JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "invalid control message",
              }));
            }
          });
          webSocket.on("close", () => {
            controlChannel.detach(controlSocket, "socket closed");
          });
          webSocket.on("error", () => {
            controlChannel.detach(controlSocket, "socket error");
          });
          webSocketServer.emit("connection", webSocket, request);
        });
      });
    },
  };
}
