# Runtime Fleet Control Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Runtime Fleet from a one-time snapshot viewer into a device-connected management surface with clean information structure, a persistent device agent mode, and a minimal WebSocket control channel for heartbeat and remote refresh.

**Architecture:** Agentlane keeps `Device + Runtime + Agent + Channel` as the product object model. The device-side collector keeps `--once` for smoke tests and adds daemon behavior for persistent registration. The backend owns snapshot storage, connection status, and command lifecycle; WebSocket is used as the device control plane, while HTTP snapshot ingest remains valid for larger inventory payloads.

**Tech Stack:** TypeScript, React, Vite middleware, Vitest, Playwright, Node.js collector script, native Node `WebSocket` client when available, and `ws` for the local dev backend WebSocket server.

---

## File Map

- `docs/product/runtime-device-registration-spec.md`: product and technical contract for device registration, snapshots, heartbeats, and WS control.
- `docs/product/runtime-fleet-page-spec.md`: visible Runtime Fleet page behavior, field policy, non-goals, and acceptance criteria.
- `docs/superpowers/plans/2026-05-08-runtime-fleet-control-channel.md`: execution plan and review checklist.
- `src/runtime/runtime-normalize.ts`: normalized runtime object model additions for device connection and runtime endpoints.
- `src/runtime/runtime-inventory-query.ts`: query and detail view-model logic for simplified UI information structure.
- `src/runtime/RuntimeFleetPage.tsx`: Runtime Fleet UI, detail sections, refresh action, and status labels.
- `src/runtime/runtime-inventory-query.test.ts`: unit harness for detail sections and table semantics.
- `src/runtime/runtime-normalize.test.ts`: unit harness for new connection fields and endpoint normalization.
- `src/runtime/device-collector-script.test.ts`: script harness for collector daemon options, WS URL generation, and remote refresh behavior.
- `src/server/runtime-inventory-store.ts`: snapshot persistence plus device connection and command lifecycle state.
- `src/server/runtime-control-channel.ts`: WebSocket connection manager, message validation, heartbeat, and refresh command dispatch.
- `src/server/runtime-control-channel.test.ts`: backend harness for connection status, heartbeat TTL, command result, and disconnect behavior.
- `vite.config.ts`: Vite middleware wiring for latest snapshot, refresh command API, and WS upgrade endpoint.
- `scripts/agentlane-device-collector.mjs`: collector daemon mode, WS connect, heartbeat, refresh command handling, and HTTP snapshot post.
- `scripts/install-device-collector.sh`: installer arguments and service command for daemon mode.
- `src/App.test.tsx`: component harness for Runtime Fleet refresh and simplified detail labels.
- `e2e/runtime-fleet.spec.ts`: browser harness for Runtime Fleet information layout and refresh flow.
- `package.json` / `package-lock.json`: add `ws` dependency and keep harness scripts current.
- `AGENTS.md`: update harness mapping and agent-facing rules for Runtime Fleet control channel.

---

## Task 1: Product Specs And Plan

- [ ] Update `docs/product/runtime-device-registration-spec.md` with the Device Agent daemon, WebSocket control channel, heartbeat, remote refresh, state layering, field policy, and non-goals.
- [ ] Update `docs/product/runtime-fleet-page-spec.md` with simplified visible fields, detail section names, refresh states, and acceptance criteria.
- [ ] Run `npm run check:repo`.
- [ ] Review the docs against this checklist: no chat entrypoint, no central-agent routing, no arbitrary remote command execution, no external platform create/edit in this phase.
- [ ] Commit as `docs: specify runtime fleet control channel`.

## Task 2: Runtime Fleet Information Model

- [ ] Write failing tests in `src/runtime/runtime-inventory-query.test.ts` for:
  - device details using `身份信息`, `连接状态`, and `平台注册`;
  - runtime details showing owning device and endpoint, not raw capabilities/channel lists;
  - agent details showing owning runtime/device and channel binding, not raw source refs;
  - runtime table and agent table source labels matching the new semantics.
- [ ] Run `npm run check:runtime` and verify the new tests fail for the expected missing view-model fields.
- [ ] Update `src/runtime/runtime-inventory-query.ts` with sectioned detail view models and helper labels.
- [ ] Update `src/runtime/RuntimeFleetPage.tsx` to render the simplified tables and sectioned details.
- [ ] Update `src/styles.css` only for layout changes needed by the new fields.
- [ ] Update `src/App.test.tsx` and `e2e/runtime-fleet.spec.ts` to assert the visible Chinese labels and simplified detail content.
- [ ] Run `npm run check:quick` and `npm run check:e2e`.
- [ ] Self-review UI information density and responsive behavior.
- [ ] Commit as `refactor: simplify runtime fleet information model`.

## Task 3: Backend State And Control Model

- [ ] Write failing tests in `src/server/runtime-inventory-store.test.ts` for latest snapshot plus connection status and command history.
- [ ] Write failing tests in `src/server/runtime-control-channel.test.ts` for:
  - `hello` registering a device connection;
  - `heartbeat` updating last seen and summary;
  - disconnect marking the device offline or stale;
  - `inventory.refresh` command lifecycle from pending to succeeded or failed.
- [ ] Run `npm run check:backend` and verify the new tests fail for missing backend APIs.
- [ ] Add `ws` and `@types/ws` as project dependencies if needed by the server implementation.
- [ ] Implement the smallest `RuntimeInventoryStateStore` shape in `src/server/runtime-inventory-store.ts`.
- [ ] Implement `src/server/runtime-control-channel.ts` with JSON message validation, connection registry, heartbeat handling, refresh dispatch, and command result handling.
- [ ] Run `npm run check:backend`.
- [ ] Self-review that no auth token, API key, or runtime secret can be persisted or logged.
- [ ] Commit as `feat: add runtime fleet control state`.

## Task 4: Vite API And WebSocket Wiring

- [ ] Write failing API-level tests or server-unit tests for:
  - `GET /api/runtime-inventory/latest` still returning the latest snapshot;
  - `POST /api/devices/:deviceId/refresh` returning a command when the device is connected;
  - refresh returning a clear error when the device is disconnected.
- [ ] Update `vite.config.ts` to wire the shared store and control manager into HTTP middleware and the WS upgrade path.
- [ ] Expose the WS path as `/api/device-control/ws`.
- [ ] Keep `/api/device-snapshots` compatible with the current collector.
- [ ] Run `npm run check:backend`.
- [ ] Commit as `feat: wire device control api`.

## Task 5: Device Collector Daemon And WS Client

- [ ] Write failing tests in `src/runtime/device-collector-script.test.ts` for:
  - `--ws-url` and config-derived WS URL behavior;
  - `--once` remaining unchanged;
  - daemon mode still posting interval snapshots when WS is unavailable;
  - refresh command collecting and posting a fresh snapshot when WS is available.
- [ ] Run `npm run check:backend` and verify the new script tests fail for missing behavior.
- [ ] Update `scripts/agentlane-device-collector.mjs`:
  - parse `--ws-url`;
  - derive WS URL from `serverUrl` when possible;
  - send `hello` and heartbeat messages;
  - handle `inventory.refresh`;
  - preserve `--once` and `--print-only`;
  - avoid logging secrets.
- [ ] Update `scripts/install-device-collector.sh` so service mode starts daemon behavior and writes WS config.
- [ ] Run `npm run check:backend`.
- [ ] Self-review macOS launchd and Linux systemd commands for no shell interpolation of secrets into logs.
- [ ] Commit as `feat: add device collector control channel`.

## Task 6: Frontend Remote Refresh

- [ ] Write failing component tests in `src/App.test.tsx` for refresh button states:
  - available when backend snapshot is loaded;
  - calls `/api/devices/:deviceId/refresh`;
  - shows command accepted / failed feedback;
  - reloads latest snapshot after a successful refresh result.
- [ ] Run `npm run check:quick` and verify the new tests fail for missing frontend behavior.
- [ ] Update `src/runtime/RuntimeFleetPage.tsx` to call the refresh API, render refresh state, and reload latest backend snapshot.
- [ ] Update `e2e/runtime-fleet.spec.ts` to cover the refresh affordance without requiring a live remote device.
- [ ] Run `npm run check:quick` and `npm run check:e2e`.
- [ ] Self-review mobile and wide desktop layout.
- [ ] Commit as `feat: support runtime fleet remote refresh`.

## Task 7: Harness And Documentation Closure

- [ ] Update `AGENTS.md` with Runtime Fleet control channel specs and harness mapping.
- [ ] Update `README.md` only if durable business-facing project behavior changed.
- [ ] Update `scripts/verify.sh` or `package.json` only if new checks are not already covered.
- [ ] Run `npm run check:repo`.
- [ ] Run `npm run check:quick`.
- [ ] Run `npm run check:backend`.
- [ ] Run `npm run check:build`.
- [ ] Run `npm run check:e2e`.
- [ ] Run `./scripts/verify.sh`.
- [ ] Review `git diff --stat` and `git status --short`.
- [ ] Commit as `test: cover runtime fleet control harness` if there are remaining harness/doc changes.

---

## Final Self-Review Checklist

- [ ] Device identity is stable and does not depend on SSH.
- [ ] Hostname, IP, MAC, and port data are shown only when useful for identification or connection debugging.
- [ ] WebSocket is limited to the device control plane.
- [ ] Snapshot ingest remains HTTP-compatible.
- [ ] Refresh command is idempotent by `commandId`.
- [ ] Connection state is separated from runtime health and agent availability.
- [ ] The UI does not expose raw token, API key, auth header, or process command secret.
- [ ] Fixture fallback remains useful for local preview.
- [ ] All required harnesses pass from a clean working tree.
