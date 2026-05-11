# Agentlane Agent Guide

Root guide for coding agents working in this repository. This file is operational: it tells agents how to understand Agentlane, preserve product boundaries, update specs, run harnesses, and self-close implementation work. Keep public project background in `README.md`.

## Project State

Agentlane is currently in product definition and early engineering setup. The repository is becoming the control plane for operating an Agent Network. It now has a Chinese-first Catalog page, a Runtime Fleet page, a read-only Runs / Work Board page, collector-backed runtime inventory and work-state models, and a standalone local backend with Postgres-backed query APIs plus an outbound WebSocket device control channel. It does not yet have a production deployment, auth system, multi-device orchestration, or runtime execution control system.

Current source of truth:

- `README.md`: public project overview and operating model.
- `docs/product/ui-design.md`: product object model, information architecture, pages, flows, and implementation priorities.
- `docs/product/catalog-page-spec.md`: TinySpec for the first Catalog / Registry page.
- `docs/product/runtime-device-registration-spec.md`: TinySpec for v1 device registration, collector, runtime adapters, and runtime inventory snapshots.
- `docs/product/runtime-fleet-page-spec.md`: TinySpec for the first Runtime Fleet management page.
- `docs/product/runtime-work-state-probe.md`: platform probe matrix for work items, conversations, and runtime executions.
- `docs/product/runtime-listening-acceptance-spec.md`: TinySpec for whether OpenClaw, Multica, and Slock listening is sufficient for Runs and future task management.
- `docs/product/backend-service-spec.md`: TinySpec for the local-first formal backend service, Postgres persistence, collector ingestion, and backend query APIs.
- `src/catalog/catalog-object.ts`: initial TypeScript source of truth for Catalog Object shape.
- `src/catalog/catalog-seed.ts`: first reviewable seed data for the Catalog page.
- `src/runtime/runtime-normalize.ts`: TypeScript source of truth for v1 runtime inventory normalization.
- `src/runtime/runtime-work-state.ts`: TypeScript source of truth for work item, conversation, execution, and observation capability models.
- `src/runtime/runtime-work-state-adapters.ts`: adapter normalization for OpenClaw, Multica, and Slock work-state inputs.
- `src/runtime/runtime-work-state-query.ts`: frontend-facing query model for the read-only Runs / Work Board page.
- `src/runtime/runtime-listening-acceptance.ts`: TypeScript source of truth for source-specific listening readiness and Runs lane policy.
- `src/runtime/runtime-inventory-query.ts`: query and detail model for the Runtime Fleet page.
- `src/server/runtime-inventory-store.ts`: internal snapshot and command state store used for collector validation and the v1 device control channel.
- `src/server/postgres-store.ts`: Postgres-backed repository for normalized inventory and work-state ingestion.
- `src/server/runtime-control-channel.ts`: in-memory v1 device control channel for connection, heartbeat, and refresh command lifecycle.
- `src/server/runtime-http-api.ts`: backend HTTP API for collector ingestion, Runtime Fleet / Runs query endpoints, refresh commands, and ingestion diagnostics.
- `src/backend/backend-server.ts`: standalone local-first backend service that composes the HTTP API and device WebSocket control channel outside Vite.
- `db/migrations/`: Postgres schema migrations for the formal backend service.
- `scripts/db-migrate.mjs`: local Postgres migration runner.
- `scripts/agentlane-device-collector.mjs`: device-side collector / Device Agent script.
- `scripts/install-device-collector.sh`: local-path collector installer for development and remote-device testing.
- `e2e/catalog-workflow.spec.ts`: browser-level user workflow harness for the Catalog page.
- `e2e/catalog-layout.spec.ts`: browser-level responsive layout harness for the Catalog page.
- `e2e/runtime-fleet.spec.ts`: browser-level Runtime Fleet workflow and responsive layout harness.
- `e2e/runtime-work-board.spec.ts`: browser-level Runs / Work Board workflow and responsive layout harness.
- `docs/product/agent-network-runtime-panorama.png`: runtime panorama.
- `docs/product/agent-network-build-objects.png`: build object map.
- `assets/product-ui/`: UI and flow design assets.

## Working Rules

- Preserve the boundary between product docs and team execution plans. Do not add internal rollout plans, owner assignments, or temporary team checklists to the repo unless the user explicitly asks.
- Treat Workflow, Domain Agent, Semantic Coordinator, Runtime / Execution Fabric, Registry / Catalog, Governance, and Lifecycle definitions in `docs/product/ui-design.md` as the product baseline.
- Keep changes proportional to the current phase. Do not create empty framework directories, speculative services, broad schemas, or placeholder platforms before they are needed.
- Keep `README.md` business-facing: project background, use cases, operating model, current status, and durable design links. Put coding-agent rules, local commands, harness details, and self-verification workflow in this file.
- Use semantic filenames for durable assets. Avoid leaving uploaded image names with spaces or copy suffixes when the asset becomes part of product documentation.
- When code directories appear, add scoped `AGENTS.md` files only where local commands, boundaries, or ownership differ from this root guide.
- Treat the device WebSocket as a control plane only. Do not use it for chat, arbitrary command execution, external platform protocol emulation, or task scheduling until a spec and harness explicitly introduce those behaviors.
- Keep runtime/device secrets out of logs, fixtures, tests, docs, and UI screenshots. `deviceToken`, Slock keys, bearer tokens, and platform API keys may be passed through local config, but v1 does not implement full auth or secret management.
- Runtime adapters must translate platform-specific fields into Agentlane-owned semantics before UI consumption. Do not make React components infer whether OpenClaw sessions, Multica tasks, or Slock workspaces mean `active`, `idle`, `lastSeenAt`, or runtime statistics.
- Keep Runtime and Channel separate in UI and query models. OpenClaw, Multica, Slock, Codex, and Claude Code are Runtime / platform sources; Runs Channel filters are only user-facing touchpoints such as DingTalk, Telegram, Slack, or future detected message channels.
- Runs / Work Board must stay task-context first: do not render unlinked runtime executions, listening status, capability gaps, adapter evidence, raw limitations, command names, or debugging notes as user-facing task cards. If a platform cannot provide creator, assignee, group/channel, message excerpt, or execution state for a real work item, show a concise unsupported/unknown/user-facing fallback and keep details in logs/spec/harness. Do not display raw DingTalk `cid...`, phone numbers, open conversation ids, or other opaque external ids as conversation names. For DingTalk direct chats without a readable person name, show `DingTalk 私聊`; for groups without a readable name, show `DingTalk 群聊（名称待补全）`. A real work item with no linked execution should say `未关联执行`, not `不支持采集`.

## Spec And Harness Workflow

Every non-trivial change should leave the repo easier for the next agent to operate.

Use this loop:

1. Read the relevant product source of truth before editing.
2. Update or add the smallest useful spec when behavior, scope, acceptance criteria, or non-goals change.
3. Add or update the narrowest harness that can prove the important behavior.
4. Implement against the spec and harness.
5. Run the relevant focused checks while iterating.
6. Run the full harness before handoff.

Current spec and harness mapping:

| Surface | Spec / Intent | Harness |
|---|---|---|
| Catalog Object model | `src/catalog/catalog-object.ts`, `docs/product/catalog-page-spec.md` | `src/catalog/catalog-query.test.ts`, `npm run check:quick` |
| Catalog page behavior | `docs/product/catalog-page-spec.md` | `src/App.test.tsx`, `npm run check:quick` |
| Catalog user workflow | `docs/product/catalog-page-spec.md` | `e2e/catalog-workflow.spec.ts`, `npm run check:e2e` |
| Catalog responsive layout | `docs/product/catalog-page-spec.md` | `e2e/catalog-layout.spec.ts`, `npm run check:e2e` |
| Runtime device registration | `docs/product/runtime-device-registration-spec.md`, `src/runtime/runtime-normalize.ts`, `scripts/agentlane-device-collector.mjs`, `scripts/install-device-collector.sh` | `src/runtime/runtime-normalize.test.ts`, `src/runtime/device-collector-script.test.ts`, `npm run check:runtime`, `npm run check:backend` |
| Runtime work state model | `src/runtime/runtime-work-state.ts`, `docs/product/runtime-work-state-probe.md` | `src/runtime/runtime-work-state.test.ts`, `npm run check:runtime` |
| Runtime work state adapters and board query | `src/runtime/runtime-work-state-adapters.ts`, `src/runtime/runtime-work-state-query.ts`, `docs/product/runtime-work-state-probe.md` | `src/runtime/runtime-work-state-adapters.test.ts`, `src/runtime/runtime-work-state-query.test.ts`, `npm run check:runtime` |
| Runtime work state collector | `scripts/agentlane-device-collector.mjs`, `docs/product/runtime-work-state-probe.md` | `src/runtime/device-collector-script.test.ts`, `npm run check:runtime`, `npm run check:backend` |
| Runtime listening acceptance | `docs/product/runtime-listening-acceptance-spec.md`, `src/runtime/runtime-listening-acceptance.ts`, `docs/product/runtime-work-state-probe.md` | `src/runtime/runtime-listening-acceptance.test.ts`, `src/runtime/runtime-work-state-adapters.test.ts`, `npm run check:runtime` |
| Runs / Work Board page | `src/runtime/RuntimeWorkBoardPage.tsx`, `docs/product/runtime-work-state-probe.md` | `src/App.test.tsx`, `e2e/runtime-work-board.spec.ts`, `npm run check:quick`, `npm run check:e2e` |
| Runtime Fleet page | `docs/product/runtime-fleet-page-spec.md`, `src/runtime/runtime-inventory-query.ts`, `src/runtime/RuntimeFleetPage.tsx` | `src/runtime/runtime-inventory-query.test.ts`, `src/App.test.tsx`, `e2e/runtime-fleet.spec.ts`, `npm run check:quick`, `npm run check:e2e` |
| Runtime snapshot and control backend | `docs/product/runtime-device-registration-spec.md`, `src/server/runtime-inventory-store.ts`, `src/server/runtime-control-channel.ts`, `src/server/runtime-http-api.ts`, `src/backend/backend-server.ts` | `src/server/runtime-inventory-store.test.ts`, `src/server/runtime-control-channel.test.ts`, `src/server/runtime-http-api.test.ts`, `src/runtime/device-collector-script.test.ts`, `npm run check:backend` |
| Backend service formalization | `docs/product/backend-service-spec.md`, `src/backend/backend-server.ts`, `src/server/postgres-store.ts`, `db/migrations/`, `scripts/db-migrate.mjs`, `scripts/dev-e2e.ts` | `src/backend/backend-server.test.ts`, `src/server/db-migrate.test.ts`, `src/server/postgres-store.test.ts`, `src/server/runtime-http-api-postgres.test.ts`, `npm run check:backend:standalone`, `npm run check:db`, `npm run check:backend` |
| Repo context and docs | `AGENTS.md`, `README.md`, `docs/product/ui-design.md` | `npm run check:repo` |

When a user points out a missed behavior or review gap, decide whether it should become:

- Context: durable agent rule in this file.
- Spec: acceptance criteria or non-goal in a product spec.
- Harness: executable check in unit, component, browser, contract, or future runtime tests.

## Test Layout

Keep the test layout simple and tied to what each harness can prove:

- Put pure logic tests next to the source they verify, for example `src/catalog/catalog-query.test.ts`.
- Put React component and jsdom interaction tests near the component surface, for example `src/App.test.tsx`.
- Keep shared Vitest / Testing Library setup in `src/test/setup.ts`.
- Put real-browser Playwright specs in `e2e/`. Use this for user workflows, responsive layout, browser rendering, and behavior jsdom cannot prove.
- Keep Playwright server state isolated from manual dev/acceptance state. The default e2e web server uses `scripts/dev-e2e.ts`, an isolated `agentlane_e2e` Postgres database, the standalone backend, and a Vite proxy so test fixture posts do not overwrite manual review data.
- Prefer adding the smallest focused test that captures the important behavior. Do not create broad `tests/`, `specs/`, or `harnesses/` directories until the project has enough surfaces to justify them.

## Agent-Ready Growth

Agentlane should become agent-ready by growing only the infrastructure the project actually needs. The current layer is **Catalog + Runtime Fleet + Runs Work-State Harness Ready** for the first frontend/runtime surfaces: root guide, TinySpecs, TypeScript object models, standalone local backend, Postgres-backed query APIs, outbound device control channel, collector snapshot harnesses, unit/component tests, browser layout harness, and one full verification entry point.

Extend this guide and `./scripts/verify.sh` only when a real project surface appears:

- Frontend code: add frontend commands and checks; keep browser layout checks in Playwright when jsdom cannot prove behavior.
- Backend service: add API, schema, migration, and contract checks.
- Catalog object models: document the schema source of truth and generated-file policy if any.
- Runtime / Execution Fabric: add worker setup, collector registration, runtime adapter, sandbox, queue, health-check, and artifact rules.
- PR or release flow: add the smallest useful gates for owner review, approval boundary, audit evidence, and rollback notes.

Do not add empty `specs/`, `evals/`, `harnesses/`, service directories, heavyweight spec frameworks, or generic agent platform rules before Agentlane has an Agentlane-specific need.

## Verification

Run the full repository harness before handing off changes:

```sh
./scripts/verify.sh
```

Equivalent package entry points are `npm run verify`, `npm run check`, and `npm run harness`. The full harness verifies required product documents/assets, local Markdown links, Postgres migration checks, backend store/control/API checks, collector script behavior, TypeScript typecheck, unit/component tests, production build, and the Playwright responsive layout harness.

If the local Playwright browser is missing, install the current test browser once:

```sh
npm run setup:e2e
```

Current harness scripts:

| Script | Purpose | Run When |
|---|---|---|
| `npm run setup:e2e` | Install the current Playwright Chromium browser. | Once per local machine, or when Playwright asks for browser installation. |
| `npm run db:up` | Start local Postgres through Docker Compose. | Before local backend DB development or manual migration checks. |
| `npm run db:migrate` | Apply pending Postgres migrations to `DATABASE_URL`, defaulting to local compose Postgres. | Schema changes, local DB setup, or backend service development. |
| `npm run check:repo` | Required source-of-truth paths and local Markdown links. | Docs, assets, agent context, or product spec changes. |
| `npm run check:backend:standalone` | Standalone backend HTTP and WebSocket smoke tests. | Backend server composition, local backend entrypoint, or server lifecycle changes. |
| `npm run check:db` | Starts local Postgres, runs migration/repository integration tests against temporary databases, and drops them. | Database schema, migration runner, Postgres repository, Docker Compose, or Postgres dependency changes. |
| `npm run check:backend` | Focused local backend store, control channel, HTTP API, and collector POST / WebSocket harness. | Runtime snapshot API, backend API handler, collector posting, device WebSocket, inventory + work-state refresh command lifecycle, or backend persistence changes. |
| `npm run check:runtime` | Focused Runtime / Device Registration and work-state unit/script harness. | Runtime inventory model, work-state model, collector, installer, fixture, probe adapter, or query changes. |
| `npm run check:quick` | TypeScript typecheck plus Vitest unit/component tests. | Catalog model, Runtime Fleet query logic, React behavior, labels, or seed data changes. |
| `npm run check:build` | Production TypeScript/Vite build. | Frontend, dependency, Vite, TypeScript, or package changes. |
| `npm run check:e2e` | Playwright browser harness using isolated Postgres, standalone backend, and Vite proxy. | Catalog/Runtime Fleet/Runs interaction paths, layout, toolbar, responsive behavior, navigation shell, backend query wiring, or visual regression risk. |
| `npm run verify` | Full harness, same as `./scripts/verify.sh`. | Before handoff, commit, or review. |

Local frontend development:

```sh
npm install
npm run setup:e2e
npm run db:up
npm run db:migrate
```

Then run these in separate terminals:

```sh
npm run dev:backend
npm run dev
```

Local backend development:

```sh
npm run db:up
npm run db:migrate
npm run dev:backend
```

## Change Hygiene

- Prefer focused commits: product docs, object model, frontend, backend, runtime, and verification changes should be easy to review independently.
- Before committing, check `git status --short` and make sure there are no unrelated user changes mixed in.
- If adding generated output later, document the source command and avoid hand-editing generated files.
- Do not claim completion until the relevant harness has passed and the final answer names what was verified.
