import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import {
  createAuthHttpApiHandler,
  createAuthRuntimeGuards,
  type AuthEmailProvider,
} from "../auth/auth-http-api";
import { createPostgresAuthStore, type AuthStore } from "../auth/auth-store";
import { createOperationJobRunner } from "../operations/job-runner";
import { createPostgresOperationStore, type OperationStore } from "../operations/operation-store";
import { createRuntimeControlChannel, type RuntimeControlSocket } from "../server/runtime-control-channel";
import { createRuntimeHttpApiHandler } from "../server/runtime-http-api";
import { createRuntimeInventoryStore } from "../server/runtime-inventory-store";
import { createPostgresStore, type PostgresStore } from "../server/postgres-store";
import { createRuntimeWorkStateStore } from "../server/runtime-work-state-store";
import { createSkillGovernanceHttpApiHandler } from "../skills/skill-governance-http-api";
import {
  createPostgresSkillGovernanceStore,
  type SkillGovernanceStore,
} from "../skills/skill-governance-store";
import { createSkillHttpApiHandler } from "../skills/skill-http-api";
import { createSkillOperationJobHandlers } from "../skills/skill-operation-handlers";
import { createPostgresSkillStore, type SkillStore } from "../skills/skill-store";

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
  /** Optional auth repository injection for tests. */
  authStore?: AuthStore;
  /** Optional Skill repository injection for tests. */
  skillStore?: SkillStore;
  /** Optional Skill governance repository injection for tests. */
  skillGovernanceStore?: SkillGovernanceStore;
  /** Optional Operation repository injection for tests. */
  operationStore?: OperationStore;
  /** Enable or disable the in-process Operation job runner. */
  operationRunnerEnabled?: boolean;
  /** Operation runner polling interval in milliseconds. */
  operationRunnerIntervalMs?: number;
  /** Optional email provider injection for tests. */
  emailProvider?: AuthEmailProvider;
  /** Whether Runtime Fleet / Runs read APIs require a valid user session. */
  authRequired?: boolean;
  /** Whether collector ingestion and device WebSocket require a valid device token. */
  deviceTokenRequired?: boolean;
  /** Auth HMAC pepper override for tests. */
  authPepper?: string;
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
  const ownedAuthStore = options.authStore
    ? null
    : createPostgresAuthStore({ connectionString: options.databaseUrl });
  const authStore = options.authStore ?? ownedAuthStore;
  const authGuards = authStore ? createAuthRuntimeGuards(authStore, { pepper: options.authPepper }) : undefined;
  const ownedSkillStore = options.skillStore
    ? null
    : createPostgresSkillStore({ connectionString: options.databaseUrl });
  const skillStore = options.skillStore ?? ownedSkillStore;
  const ownedSkillGovernanceStore = options.skillGovernanceStore
    ? null
    : createPostgresSkillGovernanceStore({ connectionString: options.databaseUrl });
  const skillGovernanceStore = options.skillGovernanceStore ?? ownedSkillGovernanceStore;
  const ownedOperationStore = options.operationStore
    ? null
    : createPostgresOperationStore({ connectionString: options.databaseUrl });
  const operationStore = options.operationStore ?? ownedOperationStore;
  const operationRunnerEnabled = options.operationRunnerEnabled
    ?? Boolean(options.databaseUrl ?? process.env.DATABASE_URL);
  const operationRunnerIntervalMs = options.operationRunnerIntervalMs
    ?? Number(process.env.AGENTLANE_OPERATION_RUNNER_INTERVAL_MS ?? 1_000);
  const operationRunner = operationRunnerEnabled && operationStore && skillGovernanceStore
    ? createOperationJobRunner({
      handlers: createSkillOperationJobHandlers({ governanceStore: skillGovernanceStore }),
      operationStore,
      runnerId: process.env.AGENTLANE_OPERATION_RUNNER_ID ?? "agentlane-backend",
    })
    : undefined;
  const authRequired = options.authRequired ?? process.env.AGENTLANE_AUTH_REQUIRED === "1";
  const deviceTokenRequired = options.deviceTokenRequired ?? process.env.AGENTLANE_DEVICE_TOKEN_REQUIRED === "1";
  const authHandler = authStore
    ? createAuthHttpApiHandler({
      emailProvider: options.emailProvider ?? createBackendEmailProvider(),
      pepper: options.authPepper,
      store: authStore,
    })
    : undefined;
  const httpHandler = createRuntimeHttpApiHandler({
    auth: {
      requireDeviceToken: deviceTokenRequired ? authGuards?.requireDeviceToken : undefined,
      requireUserSession: authRequired ? authGuards?.requireUserSession : undefined,
    },
    store,
    controlChannel,
    workStateStore,
    postgresStore: postgresStore ?? undefined,
  });
  const skillHandler = authGuards && skillStore
    ? createSkillHttpApiHandler({
      governanceStore: skillGovernanceStore ?? undefined,
      requireUserSession: authGuards.requireUserSession,
      skillStore,
    })
    : undefined;
  const skillGovernanceHandler = authGuards && skillStore && skillGovernanceStore
    ? createSkillGovernanceHttpApiHandler({
      governanceStore: skillGovernanceStore,
      operationStore: operationStore ?? undefined,
      requireUserSession: authGuards.requireUserSession,
      skillStore,
    })
    : undefined;
  const webSocketServer = new WebSocketServer({ noServer: true });
  const server = createServer((request, response) => {
    const notFound = () => {
      response.statusCode = 404;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("not found");
    };
    const runRuntimeHandler = () => {
      void httpHandler(request, response, notFound);
    };
    const runSkillHandler = () => {
      if (skillHandler) {
        void skillHandler(request, response, runRuntimeHandler);
      } else {
        runRuntimeHandler();
      }
    };
    const runSkillGovernanceHandler = () => {
      if (skillGovernanceHandler) {
        void skillGovernanceHandler(request, response, runSkillHandler);
      } else {
        runSkillHandler();
      }
    };
    if (authHandler) {
      void authHandler(request, response, runSkillGovernanceHandler);
    } else {
      runSkillGovernanceHandler();
    }
  });
  let baseUrl = "";
  let listening = false;
  let postgresClosed = false;
  let authClosed = false;
  let skillClosed = false;
  let skillGovernanceClosed = false;
  let operationClosed = false;
  let operationRunnerTimer: ReturnType<typeof setInterval> | null = null;
  let operationRunnerRunning = false;

  const runOperationRunnerTick = async () => {
    if (!operationRunner || operationRunnerRunning) return;
    operationRunnerRunning = true;
    try {
      await operationRunner.runDueJobOnce();
    } catch {
      // Keep the backend alive when the runner cannot claim or execute a due job.
    } finally {
      operationRunnerRunning = false;
    }
  };

  server.on("upgrade", (request, socket, head) => {
    void (async () => {
      const requestUrl = new URL(request.url || "/", "http://agentlane.local");
      if (requestUrl.pathname !== "/api/device-control/ws") {
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        attachDeviceControlWebSocket(webSocket, {
          authGuards,
          controlChannel,
          deviceTokenRequired,
        });
        webSocketServer.emit("connection", webSocket, request);
      });
    })().catch(() => {
      socket.destroy();
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
          if (operationRunner && !operationRunnerTimer) {
            void runOperationRunnerTick();
            operationRunnerTimer = setInterval(() => {
              void runOperationRunnerTick();
            }, Math.max(100, operationRunnerIntervalMs));
          }
          resolve();
        });
      });
    },
    async close() {
      if (operationRunnerTimer) {
        clearInterval(operationRunnerTimer);
        operationRunnerTimer = null;
      }
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
      if (ownedAuthStore && !authClosed) {
        authClosed = true;
        await ownedAuthStore.close();
      }
      if (ownedSkillStore && !skillClosed) {
        skillClosed = true;
        await ownedSkillStore.close();
      }
      if (ownedSkillGovernanceStore && !skillGovernanceClosed) {
        skillGovernanceClosed = true;
        await ownedSkillGovernanceStore.close();
      }
      if (ownedOperationStore && !operationClosed) {
        operationClosed = true;
        await ownedOperationStore.close();
      }
    },
  };
}

function attachDeviceControlWebSocket(
  webSocket: WebSocket,
  options: {
    authGuards?: ReturnType<typeof createAuthRuntimeGuards>;
    controlChannel: ReturnType<typeof createRuntimeControlChannel>;
    deviceTokenRequired: boolean;
  },
): void {
  let controlSocket: RuntimeControlSocket | undefined;
  let authenticated = !options.deviceTokenRequired;

  const ensureControlSocket = () => {
    if (controlSocket) return controlSocket;
    controlSocket = {
      send(data) {
        if (webSocket.readyState === WebSocket.OPEN) webSocket.send(data);
      },
    };
    options.controlChannel.attach(controlSocket);
    return controlSocket;
  };

  if (!options.deviceTokenRequired) ensureControlSocket();

  webSocket.on("message", (message) => {
    void (async () => {
      if (!authenticated) {
        const hello = parseControlHello(message.toString());
        if (!hello || !hello.deviceToken || !(await options.authGuards?.verifyDeviceTokenValue(hello.deviceToken))) {
          webSocket.close(1008, "invalid device token");
          return;
        }
        authenticated = true;
        const socket = ensureControlSocket();
        delete hello.deviceToken;
        receiveControlMessage(options.controlChannel, socket, JSON.stringify(hello));
        return;
      }

      receiveControlMessage(options.controlChannel, ensureControlSocket(), message.toString());
    })().catch(() => {
      webSocket.close(1008, "invalid control message");
    });
  });

  webSocket.on("close", () => {
    if (controlSocket) options.controlChannel.detach(controlSocket, "socket closed");
  });
  webSocket.on("error", () => {
    if (controlSocket) options.controlChannel.detach(controlSocket, "socket error");
  });
}

function receiveControlMessage(
  controlChannel: ReturnType<typeof createRuntimeControlChannel>,
  controlSocket: RuntimeControlSocket,
  data: string,
): void {
  try {
    controlChannel.receive(controlSocket, data);
  } catch (error) {
    controlSocket.send(JSON.stringify({
      type: "error",
      error: error instanceof Error ? error.message : "invalid control message",
    }));
  }
}

function parseControlHello(rawMessage: string): ({ deviceToken?: string } & Record<string, unknown>) | null {
  const message = JSON.parse(rawMessage) as unknown;
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  if (record.type !== "hello" || typeof record.deviceToken !== "string") return null;
  return record as { deviceToken?: string } & Record<string, unknown>;
}

function createBackendEmailProvider(): AuthEmailProvider {
  return {
    async sendLoginCode({ code, email }) {
      if (process.env.AGENTLANE_AUTH_DEBUG_CODES === "1") {
        process.stdout.write(`Agentlane login code for ${email}: ${code}\n`);
        return;
      }
      throw new Error("email_provider_not_configured");
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
