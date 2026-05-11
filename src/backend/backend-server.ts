import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { createRuntimeControlChannel, type RuntimeControlSocket } from "../server/runtime-control-channel";
import { createRuntimeHttpApiHandler } from "../server/runtime-http-api";
import { createRuntimeInventoryStore } from "../server/runtime-inventory-store";
import { createPostgresStore, type PostgresStore } from "../server/postgres-store";
import { createRuntimeWorkStateStore } from "../server/runtime-work-state-store";

/** Construction options for the standalone Agentlane backend. */
export interface AgentlaneBackendServerOptions {
  /** Host passed to `server.listen`. */
  host?: string;
  /** Port passed to `server.listen`; use 0 for tests. */
  port?: number;
  /** Optional internal inventory snapshot path used for collector validation and control state. */
  inventorySnapshotPath?: string;
  /** Optional internal work-state snapshot path used for collector validation. */
  workStateSnapshotPath?: string;
  /** Milliseconds before a silent connected device is considered stale. */
  staleAfterMs?: number;
  /** Deterministic command id injection for tests. */
  createCommandId?: () => string;
  /** Postgres connection string for the formal backend repository. */
  databaseUrl?: string;
  /** Optional repository injection for tests. */
  postgresStore?: PostgresStore;
}

/** Running standalone backend handle used by tests and local dev. */
export interface AgentlaneBackendServer {
  /** HTTP base URL after `listen` resolves. */
  readonly url: string;
  /** WebSocket base URL after `listen` resolves. */
  readonly wsUrl: string;
  /** Start listening. */
  listen: () => Promise<void>;
  /** Stop HTTP and WebSocket listeners. */
  close: () => Promise<void>;
}

/** Create the local-first standalone Agentlane backend service. */
export function createAgentlaneBackendServer(
  options: AgentlaneBackendServerOptions = {},
): AgentlaneBackendServer {
  const host = options.host ?? process.env.AGENTLANE_BACKEND_HOST ?? "0.0.0.0";
  const port = options.port ?? Number(process.env.AGENTLANE_BACKEND_PORT ?? 4173);
  const store = createRuntimeInventoryStore({
    snapshotPath: options.inventorySnapshotPath,
    staleAfterMs: options.staleAfterMs,
  });
  const workStateStore = createRuntimeWorkStateStore({
    snapshotPath: options.workStateSnapshotPath,
  });
  const controlChannel = createRuntimeControlChannel({
    store,
    createCommandId: options.createCommandId,
  });
  const ownedPostgresStore = options.postgresStore
    ? null
    : createPostgresStore({ connectionString: options.databaseUrl });
  const postgresStore = options.postgresStore ?? ownedPostgresStore;
  const httpHandler = createRuntimeHttpApiHandler({
    store,
    controlChannel,
    workStateStore,
    postgresStore: postgresStore ?? undefined,
  });
  const webSocketServer = new WebSocketServer({ noServer: true });
  const server = createServer((request, response) => {
    void httpHandler(request, response, () => {
      response.statusCode = 404;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("not found");
    });
  });
  let baseUrl = "";
  let listening = false;
  let postgresClosed = false;

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", "http://agentlane.local");
    if (requestUrl.pathname !== "/api/device-control/ws") {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      const controlSocket: RuntimeControlSocket = {
        send(data) {
          if (webSocket.readyState === WebSocket.OPEN) webSocket.send(data);
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

  return {
    get url() {
      return baseUrl;
    },
    get wsUrl() {
      return baseUrl.replace(/^http/, "ws");
    },
    listen() {
      return new Promise<void>((resolve, reject) => {
        if (listening) {
          resolve();
          return;
        }
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Agentlane backend did not receive a TCP address"));
            return;
          }
          const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
          baseUrl = `http://${displayHost}:${address.port}`;
          listening = true;
          resolve();
        });
      });
    },
    async close() {
      await closeWebSocketServer(webSocketServer);
      if (listening) {
        await closeHttpServer(server);
        listening = false;
        baseUrl = "";
      }
      if (ownedPostgresStore && !postgresClosed) {
        postgresClosed = true;
        await ownedPostgresStore.close();
      }
    },
  };
}

function closeWebSocketServer(webSocketServer: WebSocketServer): Promise<void> {
  for (const client of webSocketServer.clients) client.close();
  return new Promise((resolve, reject) => {
    webSocketServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isDirectRun(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const backend = createAgentlaneBackendServer();
  await backend.listen();
  process.stdout.write(`Agentlane backend listening on ${backend.url}\n`);
}
