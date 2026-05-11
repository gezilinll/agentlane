# Backend Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite-only local backend path with a standalone Agentlane backend service backed by Postgres, while keeping Runtime Fleet, Runs, and collector workflows working locally.

**Architecture:** Build a standalone Node backend around the existing HTTP API and WebSocket control channel, then move persistence from latest JSON files to Postgres-backed repositories. Keep the current collector payloads and UI semantics, but introduce backend-side query APIs so the frontend no longer depends on large latest snapshots as the formal path.

**Tech Stack:** Node.js 22, TypeScript, Vite/Vitest, React, Playwright, Docker Compose, Postgres 15+, `pg`.

---

## File Map

- Create `docs/product/backend-service-spec.md`: durable product / engineering spec for the backend service.
- Modify `AGENTS.md`: add backend service source of truth, commands, and harness mapping.
- Modify `scripts/check-repo.sh`: require the backend service spec and link-check it.
- Create `src/backend/backend-server.ts`: standalone HTTP and WebSocket server composition.
- Create `src/backend/backend-server.test.ts`: standalone server API smoke tests.
- Modify `package.json`: add backend dev / check scripts and backend dependencies.
- Create `docker-compose.yml`: local Postgres service for backend development.
- Create `db/migrations/0001_backend_core.sql`: first Postgres schema.
- Create `scripts/db-migrate.mjs`: migration runner.
- Create `src/server/postgres-store.ts`: Postgres-backed ingest and query repository.
- Create `src/server/postgres-store.test.ts`: repository tests against temporary Postgres.
- Modify `src/server/runtime-http-api.ts`: support DB-backed query handlers while preserving collector POST routes.
- Modify `src/runtime/RuntimeFleetPage.tsx`: use backend query API once available.
- Modify `src/runtime/RuntimeWorkBoardPage.tsx`: use backend query API once available.
- Modify `scripts/agentlane-device-collector.mjs`: align default periodic POST behavior with backend ingestion if needed.
- Modify `scripts/verify.sh`: include DB/backend checks once they exist.

## Task 1: Spec, Plan, And Repo Context

**Files:**
- Create: `docs/product/backend-service-spec.md`
- Create: `docs/superpowers/plans/2026-05-11-backend-service.md`
- Modify: `AGENTS.md`
- Modify: `scripts/check-repo.sh`

- [ ] **Step 1: Write durable backend service spec**

Add a TinySpec that states local-first backend scope, Postgres dependency, minimal DB tables, collector ingestion rules, backend query APIs, local Docker Compose environment, ECS as a later non-goal, and harness expectations.

- [ ] **Step 2: Write implementation plan**

Save this plan to `docs/superpowers/plans/2026-05-11-backend-service.md` so later agents can continue task-by-task.

- [ ] **Step 3: Update agent context**

Add `docs/product/backend-service-spec.md` as a source of truth in `AGENTS.md`, and add backend service harness mapping once scripts exist.

- [ ] **Step 4: Update repo check**

Add `docs/product/backend-service-spec.md` to `scripts/check-repo.sh` required paths and Markdown link checks.

- [ ] **Step 5: Verify docs**

Run:

```sh
npm run check:repo
```

Expected: `check:repo: ok`.

- [ ] **Step 6: Self-review and commit**

Check:

```sh
git diff --check
git status --short
```

Review that docs describe current intended state, not process notes. Then commit:

```sh
git add AGENTS.md scripts/check-repo.sh docs/product/backend-service-spec.md docs/superpowers/plans/2026-05-11-backend-service.md
git commit -m "Document backend service plan"
```

## Task 2: Standalone Backend Server

**Files:**
- Create: `src/backend/backend-server.ts`
- Create: `src/backend/backend-server.test.ts`
- Modify: `package.json`
- Modify: `src/server/runtime-http-api.ts` only if a small handler seam is needed

- [ ] **Step 1: Write failing server smoke test**

Create a Vitest test that starts the backend server on an ephemeral port with file-backed temporary stores, verifies `GET /api/runtime-inventory/latest` returns `404`, posts a minimal inventory snapshot to `POST /api/device-snapshots`, then verifies `GET /api/runtime-inventory/latest` returns that device.

Run:

```sh
npx vitest run src/backend/backend-server.test.ts
```

Expected: fail because `src/backend/backend-server.ts` does not exist.

- [ ] **Step 2: Implement backend server**

Implement a small `createAgentlaneBackendServer(options)` that composes:

- `createRuntimeInventoryStore`
- `createRuntimeWorkStateStore`
- `createRuntimeControlChannel`
- `createRuntimeHttpApiHandler`
- `WebSocketServer`

The server must expose `listen`, `close`, and `url`.

- [ ] **Step 3: Add scripts**

Add:

```json
"dev:backend": "tsx src/backend/backend-server.ts",
"check:backend:standalone": "vitest run src/backend"
```

Use `tsx` as the small TypeScript runner for the standalone backend dev process.

- [ ] **Step 4: Verify**

Run:

```sh
npx vitest run src/backend/backend-server.test.ts
npm run check:backend
```

Expected: both pass.

- [ ] **Step 5: Self-review and commit**

Review that Vite middleware behavior still works and standalone server has no product-only assumptions. Commit:

```sh
git add src/backend package.json package-lock.json
git commit -m "Add standalone backend server"
```

## Task 3: Local Postgres And Migration Harness

**Files:**
- Create: `docker-compose.yml`
- Create: `db/migrations/0001_backend_core.sql`
- Create: `scripts/db-migrate.mjs`
- Create: `src/server/db-migrate.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add dependency**

Install:

```sh
npm install pg
npm install -D @types/pg
```

- [ ] **Step 2: Write failing migration test**

Test should start with a provided `DATABASE_URL`, run the migration runner against an empty Postgres database, and assert these tables exist: `devices`, `runtimes`, `agents`, `channel_bindings`, `work_items`, `work_conversations`, `work_executions`, `collector_ingestions`.

Run without Postgres first:

```sh
npx vitest run src/server/db-migrate.test.ts
```

Expected: fail with missing migration runner or database URL. This proves harness is wired before implementation.

- [ ] **Step 3: Add Docker Compose Postgres**

Use `postgres:15-alpine` and a named volume. Expose `5432` only for local development.

- [ ] **Step 4: Add SQL migration**

Create the minimal schema with text IDs, JSONB metadata/source fields where needed, timestamps, indexes for `device_id`, `runtime_id`, `agent_id`, `source`, `stage`, and `last_seen_at`.

- [ ] **Step 5: Add migration runner**

Create `scripts/db-migrate.mjs` that reads `DATABASE_URL`, creates a `schema_migrations` table, applies unapplied SQL files in lexical order, and exits non-zero on failure.

- [ ] **Step 6: Verify with local Postgres**

Run:

```sh
docker compose up -d postgres
npm run db:migrate
npx vitest run src/server/db-migrate.test.ts
```

Expected: migration succeeds and test passes.

- [ ] **Step 7: Self-review and commit**

Review that schema contains only the eight approved tables and no user/auth/multi-tenant entities. Commit:

```sh
git add docker-compose.yml db scripts/db-migrate.mjs src/server/db-migrate.test.ts package.json package-lock.json
git commit -m "Add Postgres schema and migrations"
```

## Task 4: DB-Backed Ingest Repository

**Files:**
- Create: `src/server/postgres-store.ts`
- Create: `src/server/postgres-store.test.ts`
- Modify: `src/server/runtime-http-api.ts`

- [ ] **Step 1: Write failing repository tests**

Tests should insert a collector inventory snapshot and a runtime work-state snapshot, then query:

- one device
- expected runtime count
- expected agent count
- expected work item count by source
- at least one `collector_ingestions` row per POST type

Run:

```sh
npx vitest run src/server/postgres-store.test.ts
```

Expected: fail because repository is missing.

- [ ] **Step 2: Implement inventory ingest**

Implement `upsertInventorySnapshot(snapshot)` to upsert `devices`, `runtimes`, `agents`, `channel_bindings`, and an `inventory` ingestion row.

- [ ] **Step 3: Implement work-state ingest**

Implement `upsertWorkStateSnapshot(snapshot)` to upsert `work_items`, `work_conversations`, `work_executions`, and a `work_state` ingestion row.

- [ ] **Step 4: Preserve semantic ownership**

Do not move OpenClaw / Slock / Multica interpretation into repository code. Repository only stores normalized Agentlane models.

- [ ] **Step 5: Verify**

Run:

```sh
npx vitest run src/server/postgres-store.test.ts
npm run check:backend
```

Expected: pass.

- [ ] **Step 6: Self-review and commit**

Review upsert keys, timestamps, and warning/error persistence. Commit:

```sh
git add src/server/postgres-store.ts src/server/postgres-store.test.ts src/server/runtime-http-api.ts
git commit -m "Persist collector snapshots in Postgres"
```

## Task 5: Backend Query APIs

**Files:**
- Modify: `src/server/postgres-store.ts`
- Modify: `src/server/runtime-http-api.ts`
- Create or modify: `src/server/runtime-query-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Seed DB through collector POST routes, then call:

- `GET /api/runtime-fleet`
- `GET /api/runtime-work-items?source=slock`
- `GET /api/runtime-work-items?channelKind=dingtalk`
- `GET /api/runtime-work-items?startAt=...&endAt=...`
- `GET /api/devices/:deviceId/ingestions`

Expected: fail because query routes do not exist.

- [ ] **Step 2: Implement Runtime Fleet query**

Return frontend-ready data using the same Agentlane normalized semantics as `runtime-inventory-query.ts`. Keep server response narrow enough for the current page.

- [ ] **Step 3: Implement work item query**

Apply backend filtering for search, source, channelKind, stage, and time range. Use limit/cursor or a conservative default limit.

- [ ] **Step 4: Implement ingestion query**

Return latest ingestion rows for a device, newest first.

- [ ] **Step 5: Verify**

Run:

```sh
npx vitest run src/server/runtime-query-api.test.ts
npm run check:backend
```

Expected: pass.

- [ ] **Step 6: Self-review and commit**

Review that API does not expose raw adapter evidence or private tokens. Commit:

```sh
git add src/server/postgres-store.ts src/server/runtime-http-api.ts src/server/runtime-query-api.test.ts
git commit -m "Add backend runtime query APIs"
```

## Task 6: Frontend Backend Query Integration

**Files:**
- Modify: `src/runtime/RuntimeFleetPage.tsx`
- Modify: `src/runtime/RuntimeWorkBoardPage.tsx`
- Modify: `src/App.test.tsx`
- Modify: `e2e/runtime-fleet.spec.ts`
- Modify: `e2e/runtime-work-board.spec.ts`

- [ ] **Step 1: Write failing component tests**

Update tests so Runtime Fleet and Runs prefer query API responses over latest snapshot fallback.

- [ ] **Step 2: Implement Runtime Fleet query client**

Fetch `/api/runtime-fleet` with search/runtime/status filters. Keep fixture fallback only when backend query and latest snapshot are both unavailable during tests/dev.

- [ ] **Step 3: Implement Runs query client**

Fetch `/api/runtime-work-items` with search/source/channel/stage/time filters. Debounce search input.

- [ ] **Step 4: Verify browser behavior**

Run:

```sh
npm run check:quick
npx playwright test e2e/runtime-fleet.spec.ts e2e/runtime-work-board.spec.ts
```

Expected: pass.

- [ ] **Step 5: Self-review and commit**

Review that React components still consume Agentlane view models and do not infer platform semantics. Commit:

```sh
git add src/runtime src/App.test.tsx e2e/runtime-fleet.spec.ts e2e/runtime-work-board.spec.ts
git commit -m "Read runtime pages from backend queries"
```

## Task 7: Collector Cadence And Full Harness

**Files:**
- Modify: `scripts/agentlane-device-collector.mjs`
- Modify: `scripts/install-device-collector.sh`
- Modify: `scripts/verify.sh`
- Modify: `AGENTS.md`
- Modify: relevant tests under `src/runtime` and `src/server`

- [ ] **Step 1: Write failing collector cadence tests**

Add tests proving service mode can post inventory and work-state snapshots on the configured interval without requiring a manual refresh.

- [ ] **Step 2: Implement minimal cadence**

Keep the cadence simple: one loop for inventory + work-state, configurable interval, no queue, no background scheduler framework.

- [ ] **Step 3: Add backend checks to verify**

Extend `./scripts/verify.sh` and `AGENTS.md` with DB/backend commands. Keep commands runnable locally.

- [ ] **Step 4: Run full harness**

Run:

```sh
./scripts/verify.sh
```

Expected: all checks pass.

- [ ] **Step 5: Self-review and commit**

Review code, docs, scripts, and tests for current-state clarity. Commit:

```sh
git add scripts AGENTS.md src
git commit -m "Close backend service harness"
```

## Completion Criteria

- Local backend can run independent of Vite.
- Local Postgres schema exists and migrations run.
- Collector inventory and work-state payloads persist to Postgres.
- Runtime Fleet and Runs can use backend query APIs.
- The repo documents local environment dependencies.
- `./scripts/verify.sh` passes.
- No ECS deployment work is included in this phase.
