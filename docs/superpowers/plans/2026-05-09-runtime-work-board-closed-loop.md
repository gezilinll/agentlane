# Runtime Work Board Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Runtime Work Board closed loop from normalized OpenClaw / Multica / Slock work-state data through collector, local backend, query model, and frontend page.

**Architecture:** Platform adapters produce Agentlane-owned `RuntimeWorkStateSnapshot` objects. The local backend stores the latest snapshot and serves a read-only API. The frontend consumes a query model, not raw platform fields, so UI behavior is driven by `WorkStage`, `confidence`, and capability declarations.

**Tech Stack:** TypeScript, React, Vite middleware, Vitest, Testing Library, Playwright, Node collector script.

---

## File Structure

- Modify `docs/product/runtime-work-state-probe.md`: keep platform mapping rules as the durable product spec.
- Modify `docs/product/runtime-device-registration-spec.md`: add backend and frontend acceptance criteria for work-state snapshot flow.
- Modify `AGENTS.md`: register the new spec and harness mapping.
- Create `src/runtime/runtime-work-state-fixtures.ts`: sanitized OpenClaw / Multica / Slock sample inputs and expected normalized outputs.
- Create `src/runtime/runtime-work-state-adapters.ts`: pure adapter mappers from platform sample shapes into `RuntimeWorkStateSnapshot` pieces.
- Create `src/runtime/runtime-work-state-query.ts`: frontend-facing board model and filtering logic.
- Create `src/runtime/RuntimeWorkBoardPage.tsx`: read-only board page.
- Modify `src/App.tsx`: add navigation entry and route state for the Work Board page.
- Create `src/server/runtime-work-state-store.ts`: local latest snapshot store.
- Modify `src/server/runtime-http-api.ts`: add work-state snapshot POST and latest GET endpoints.
- Modify `scripts/agentlane-device-collector.mjs`: add work-state collection mode and snapshot POST.
- Add tests next to each source file and `e2e/runtime-work-board.spec.ts`.

## Task 1: Backend API Contract And Store

**Files:**
- Create `src/server/runtime-work-state-store.ts`
- Create `src/server/runtime-work-state-store.test.ts`
- Modify `src/server/runtime-http-api.ts`
- Modify `src/server/runtime-http-api.test.ts`

- [ ] **Step 1: Write failing store tests**

Add tests proving that the store rejects malformed snapshots and returns the latest valid snapshot:

```ts
import { describe, expect, it } from "vitest";
import { createRuntimeWorkStateStore } from "./runtime-work-state-store";

describe("runtime work state store", () => {
  it("stores and reads the latest runtime work state snapshot", () => {
    const store = createRuntimeWorkStateStore({ persist: false });
    const snapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [],
    };

    store.write(snapshot);

    expect(store.read()).toEqual(snapshot);
  });

  it("rejects snapshots without required arrays", () => {
    const store = createRuntimeWorkStateStore({ persist: false });

    expect(() => store.write({ deviceId: "fixture-device" })).toThrow("Invalid runtime work state snapshot");
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npm run check:backend`. Expected: fail because `runtime-work-state-store` does not exist.

- [ ] **Step 3: Implement the minimal store**

Create an in-memory/file-backed store mirroring the runtime inventory store style. The `write` function validates `observedAt`, `deviceId`, and the four array fields before persisting.

- [ ] **Step 4: Add HTTP API tests**

Extend `src/server/runtime-http-api.test.ts` with:

```ts
it("accepts and returns the latest runtime work state snapshot", async () => {
  const app = createRuntimeHttpApi({ runtimeWorkStateStore: createRuntimeWorkStateStore({ persist: false }) });
  const snapshot = {
    observedAt: "2026-05-09T08:00:00.000Z",
    deviceId: "fixture-device",
    workItems: [],
    conversations: [],
    executions: [],
    capabilities: [],
  };

  await expect(request(app).post("/api/runtime-work-state-snapshots").send(snapshot)).resolves.toMatchObject({
    status: 204,
  });
  await expect(request(app).get("/api/runtime-work-state/latest")).resolves.toMatchObject({
    status: 200,
    body: snapshot,
  });
});
```

- [ ] **Step 5: Implement HTTP endpoints**

Add `POST /api/runtime-work-state-snapshots` and `GET /api/runtime-work-state/latest`. Return `404` when no work-state snapshot exists.

- [ ] **Step 6: Verify GREEN**

Run `npm run check:backend`. Expected: pass.

- [ ] **Step 7: Commit**

Run:

```sh
git add src/server/runtime-work-state-store.ts src/server/runtime-work-state-store.test.ts src/server/runtime-http-api.ts src/server/runtime-http-api.test.ts
git commit -m "feat: add runtime work state api"
```

## Task 2: Platform Fixtures And Adapter Mappers

**Files:**
- Create `src/runtime/runtime-work-state-fixtures.ts`
- Create `src/runtime/runtime-work-state-adapters.ts`
- Create `src/runtime/runtime-work-state-adapters.test.ts`
- Modify `src/runtime/index.ts`

- [ ] **Step 1: Write failing adapter tests**

Cover these exact behaviors:

```ts
expect(mapOpenClawWorkState(openClawFixture).executions.map((item) => item.status)).toContain("succeeded");
expect(mapOpenClawWorkState(openClawFixture).workItems).toEqual([]);
expect(mapMulticaWorkState(multicaFixture).workItems.map((item) => item.status)).toContain("todo");
expect(mapSlockWorkState(slockFixture).workItems.map((item) => item.status)).toContain("in_review");
expect(mapSlockWorkState(slockFixture).executions).toEqual([]);
```

- [ ] **Step 2: Verify RED**

Run `npm run check:runtime`. Expected: fail because adapter functions do not exist.

- [ ] **Step 3: Add sanitized fixtures**

Create fixture objects with neutral labels such as `example-board`, `example-agent`, `fixture-human`, `fixture-run-1`, and statuses covering OpenClaw `succeeded/lost/timed_out`, Multica `todo/blocked/done`, and Slock `in_progress/in_review/done`.

- [ ] **Step 4: Implement pure mappers**

Each mapper returns a partial snapshot shape `{ workItems, conversations, executions, capabilities, warnings }`. Use `deriveRuntimeWorkStage` for stage derivation only in query code; adapter output keeps raw normalized `RuntimeWorkItem.status` and `RuntimeExecution.status`.

- [ ] **Step 5: Verify GREEN**

Run `npm run check:runtime`. Expected: pass.

- [ ] **Step 6: Commit**

Run:

```sh
git add src/runtime/runtime-work-state-fixtures.ts src/runtime/runtime-work-state-adapters.ts src/runtime/runtime-work-state-adapters.test.ts src/runtime/index.ts
git commit -m "feat: map platform work state fixtures"
```

## Task 3: Collector Work-State Snapshot Mode

**Files:**
- Modify `scripts/agentlane-device-collector.mjs`
- Modify `src/runtime/device-collector-script.test.ts`

- [ ] **Step 1: Write failing collector tests**

Add tests that run the collector with a fixture mode and assert the JSON contains `workItems`, `conversations`, `executions`, and `capabilities`.

- [ ] **Step 2: Verify RED**

Run `npm run check:backend`. Expected: fail because the collector does not emit work-state snapshots.

- [ ] **Step 3: Implement fixture-backed work-state output**

Add a collector argument `--work-state-once` for local verification. It should produce a `RuntimeWorkStateSnapshot` using the platform mappers and the current device id.

- [ ] **Step 4: Implement POST support**

When `--server-url` is present with `--work-state-once`, POST the snapshot to `/api/runtime-work-state-snapshots`.

- [ ] **Step 5: Verify GREEN**

Run `npm run check:backend`. Expected: pass.

- [ ] **Step 6: Commit**

Run:

```sh
git add scripts/agentlane-device-collector.mjs src/runtime/device-collector-script.test.ts
git commit -m "feat: collect runtime work state snapshots"
```

## Task 4: Work Board Query Model

**Files:**
- Create `src/runtime/runtime-work-state-query.ts`
- Create `src/runtime/runtime-work-state-query.test.ts`
- Modify `src/runtime/index.ts`

- [ ] **Step 1: Write failing query tests**

Test that:

```ts
const board = createRuntimeWorkBoard(snapshot);
expect(board.lanes.map((lane) => lane.stage)).toEqual(["pending", "processing", "review", "closed", "attention"]);
expect(board.lanes.find((lane) => lane.stage === "processing")?.items.some((item) => item.confidence === "partial")).toBe(true);
expect(board.summary.unsupportedCapabilities).toBeGreaterThan(0);
```

- [ ] **Step 2: Verify RED**

Run `npm run check:runtime`. Expected: fail because query model does not exist.

- [ ] **Step 3: Implement query model**

Create `createRuntimeWorkBoard(snapshot, filters?)` with lane grouping, search, source filter, stage filter, confidence filter, summary counts, and detail model fields.

- [ ] **Step 4: Verify GREEN**

Run `npm run check:runtime`. Expected: pass.

- [ ] **Step 5: Commit**

Run:

```sh
git add src/runtime/runtime-work-state-query.ts src/runtime/runtime-work-state-query.test.ts src/runtime/index.ts
git commit -m "feat: add runtime work board query model"
```

## Task 5: Work Board Page

**Files:**
- Create `src/runtime/RuntimeWorkBoardPage.tsx`
- Modify `src/App.tsx`
- Modify `src/App.test.tsx`
- Modify `src/styles.css`

- [ ] **Step 1: Write failing component tests**

Add tests that navigate to the Work Board page, see the five lane labels, filter by source, search by title, and open a detail panel showing `confidence`.

- [ ] **Step 2: Verify RED**

Run `npm run check:quick`. Expected: fail because the page and navigation entry do not exist.

- [ ] **Step 3: Implement read-only page**

Use the existing app shell style. The page reads `/api/runtime-work-state/latest`, falls back to sanitized fixture data only when the API returns `404`, labels the data source clearly, and refreshes on an interval without resetting filters or selection.

- [ ] **Step 4: Verify GREEN**

Run `npm run check:quick`. Expected: pass.

- [ ] **Step 5: Commit**

Run:

```sh
git add src/runtime/RuntimeWorkBoardPage.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add runtime work board page"
```

## Task 6: Browser Harness And Docs

**Files:**
- Create `e2e/runtime-work-board.spec.ts`
- Modify `docs/product/runtime-device-registration-spec.md`
- Modify `docs/product/runtime-work-state-probe.md`
- Modify `AGENTS.md`

- [ ] **Step 1: Write failing Playwright test**

Test a user can open the Work Board, see all lanes, filter to Slock partial work, open details, and verify mobile layout stays inside the viewport.

- [ ] **Step 2: Verify RED**

Run `npm run check:e2e`. Expected: fail before the page route and data hook are complete.

- [ ] **Step 3: Update docs and AGENTS mapping**

Document the frontend closed-loop scope, API contract, and harness entries. Keep it read-only and avoid adding routing, writeback, or proxy promises.

- [ ] **Step 4: Verify GREEN**

Run `npm run check:e2e`. Expected: pass.

- [ ] **Step 5: Run full harness**

Run `./scripts/verify.sh`. Expected: `verify: ok`.

- [ ] **Step 6: Commit**

Run:

```sh
git add e2e/runtime-work-board.spec.ts docs/product/runtime-device-registration-spec.md docs/product/runtime-work-state-probe.md AGENTS.md
git commit -m "test: cover runtime work board closed loop"
```

## Self-Review Checklist

- Each platform-specific rule is covered by a unit test.
- UI consumes `runtime-work-state-query.ts`, not raw platform fields.
- Slock `active` is never treated as execution `running`.
- OpenClaw never creates `pending` or `review` without an upstream work item.
- The page is read-only and does not imply task writeback.
- `./scripts/verify.sh` passes before final handoff.
