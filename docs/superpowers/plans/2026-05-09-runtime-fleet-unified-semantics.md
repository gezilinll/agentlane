# Runtime Fleet Unified Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Runtime Fleet present device, runtime, and agent state through Agentlane-owned semantics rather than leaking OpenClaw, Multica, or Slock source-specific meanings.

**Architecture:** Runtime adapters convert source data into the normalized runtime model; query/view helpers convert normalized data into UI-ready labels; the React page renders only Agentlane semantics. The page also polls the latest backend snapshot so the management surface stays fresh while the collector keeps reporting.

**Tech Stack:** TypeScript, React, Vite dev API, Vitest, Testing Library, Playwright.

---

### Task 1: Specs And Harness Expectations

**Files:**
- Modify: `docs/product/runtime-device-registration-spec.md`
- Modify: `docs/product/runtime-fleet-page-spec.md`
- Modify: `src/runtime/runtime-normalize.test.ts`
- Modify: `src/runtime/runtime-inventory-query.test.ts`
- Modify: `src/App.test.tsx`
- Modify: `e2e/runtime-fleet.spec.ts`

- [ ] **Step 1: Write failing model/query/UI tests**

Add tests proving:
- `ManagedRuntimeAgent.lastSeenAt` is populated by adapter fixtures.
- OpenClaw total session counts are shown as `historicalSessions`, not active sessions.
- Slock workspace-only agents are not marked `active`.
- Agent detail says `关联渠道`, not `可用渠道`.
- Device detail says `已注册 Runtime`, not `平台注册`.
- Runtime detail no longer includes `运行入口`.
- Runtime/Agent rows show local formatted last sync.
- The page polls `/api/runtime-inventory/latest` after initial load.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run check:runtime -- --runInBand` is not supported in Vitest, so use focused Vitest commands:

```sh
npm run check:runtime
npm run check:quick
```

Expected: failures mention missing `lastSeenAt`, old labels, old active/session text, or missing polling.

### Task 2: Normalize Source-Specific Data

**Files:**
- Modify: `src/runtime/runtime-normalize.ts`
- Modify: `scripts/agentlane-device-collector.mjs`

- [ ] **Step 1: Extend the normalized agent model**

Add optional `lastSeenAt` to `ManagedRuntimeAgent` and `AgentDiscovery`.
Add `historicalSessions` to the existing load shape.
Keep `activeTasks`, `queuedTasks`, `activeSessions`, `historicalSessions`, and `maxConcurrency` as Agentlane-owned statistic semantics.

- [ ] **Step 2: Update adapters**

OpenClaw:
- Map `sessionsCount` / `totalSessions` to `historicalSessions`.
- Do not map those fields to `activeSessions`.
- Use `idle` unless a current active execution signal exists.

Multica:
- Map source `status` through Agentlane status rules.
- Map `max_concurrent_tasks` to `maxConcurrency`.
- Map `updated_at` or `last_seen_at` to `lastSeenAt`.

Slock:
- Workspace existence alone maps to `unknown`, not `active`.
- Set `lastSeenAt` to the snapshot observed time.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```sh
npm run check:runtime
```

Expected: runtime model and collector script tests pass.

### Task 3: Runtime Fleet Query And UI

**Files:**
- Modify: `src/runtime/runtime-inventory-query.ts`
- Modify: `src/runtime/RuntimeFleetPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Update query/view helpers**

Add helpers for local timestamp formatting, runtime display names, and unified statistics rows:
- use local formatted timestamps for visible labels.
- expose unsupported statistics as `不支持采集`.
- display historical sessions separately from active sessions.
- remove runtime endpoint detail.
- rename sections to `已注册 Runtime`, `关联渠道`, and `运行统计`.

- [ ] **Step 2: Update React page**

Add 30-second polling of latest snapshot while the page is mounted.
Show "上次刷新" in the header when backend snapshot data is loaded.
Add last sync column to Agent table.
Use Runtime display names consistently in Runtime table, Agent table, and Agent detail.

- [ ] **Step 3: Run frontend harness and verify GREEN**

Run:

```sh
npm run check:quick
npm run check:e2e
```

Expected: component and browser tests pass with the new labels and polling behavior.

### Task 4: Docs, Full Verification, Commit

**Files:**
- Modify: `AGENTS.md` if harness mapping or runtime semantics guidance changes.
- Modify: `docs/product/runtime-device-registration-spec.md`
- Modify: `docs/product/runtime-fleet-page-spec.md`

- [ ] **Step 1: Update docs**

Document Agentlane-owned status, load/statistics, `lastSeenAt`, and auto refresh rules. Keep docs focused on durable product behavior.

- [ ] **Step 2: Run full harness**

Run:

```sh
./scripts/verify.sh
```

Expected: repo, backend, quick, build, and e2e all pass.

- [ ] **Step 3: Self-review and commit**

Run:

```sh
git diff --stat
git status --short
```

Commit the completed slice with:

```sh
git add docs/product/runtime-device-registration-spec.md docs/product/runtime-fleet-page-spec.md docs/superpowers/plans/2026-05-09-runtime-fleet-unified-semantics.md src/runtime src/App.test.tsx e2e/runtime-fleet.spec.ts scripts/agentlane-device-collector.mjs src/styles.css
git commit -m "feat: unify runtime fleet status semantics"
```
