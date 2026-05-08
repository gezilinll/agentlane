# Agentlane Agent Guide

Root guide for coding agents working in this repository. This file is operational: it tells agents how to understand Agentlane, preserve product boundaries, update specs, run harnesses, and self-close implementation work. Keep public project background in `README.md`.

## Project State

Agentlane is currently in product definition and early engineering setup. The repository is becoming the control plane for operating an Agent Network. It now has an initial frontend Catalog page, but not yet an implemented backend or runtime system.

Current source of truth:

- `README.md`: public project overview and operating model.
- `docs/product/ui-design.md`: product object model, information architecture, pages, flows, and implementation priorities.
- `docs/product/catalog-page-spec.md`: TinySpec for the first Catalog / Registry page.
- `docs/product/runtime-device-registration-spec.md`: TinySpec for v1 device registration, collector, runtime adapters, and runtime inventory snapshots.
- `src/catalog/catalog-object.ts`: initial TypeScript source of truth for Catalog Object shape.
- `src/catalog/catalog-seed.ts`: first reviewable seed data for the Catalog page.
- `src/runtime/runtime-normalize.ts`: TypeScript source of truth for v1 runtime inventory normalization.
- `e2e/catalog-workflow.spec.ts`: browser-level user workflow harness for the Catalog page.
- `e2e/catalog-layout.spec.ts`: browser-level responsive layout harness for the Catalog page.
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
| Runtime device registration | `docs/product/runtime-device-registration-spec.md`, `src/runtime/runtime-normalize.ts` | `src/runtime/runtime-normalize.test.ts`, `src/runtime/device-collector-script.test.ts`, `npm run check:runtime`, `npm run check:quick` |
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
- Prefer adding the smallest focused test that captures the important behavior. Do not create broad `tests/`, `specs/`, or `harnesses/` directories until the project has enough surfaces to justify them.

## Agent-Ready Growth

Agentlane should become agent-ready by growing only the infrastructure the project actually needs. The current layer is **Catalog Harness Ready** for the first frontend surface: root guide, TinySpec, TypeScript object model, unit/component tests, browser layout harness, and one full verification entry point.

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

Equivalent package entry points are `npm run verify`, `npm run check`, and `npm run harness`. The full harness verifies required product documents/assets, local Markdown links, TypeScript typecheck, unit/component tests, production build, and the Playwright responsive layout harness.

If the local Playwright browser is missing, install the current test browser once:

```sh
npm run setup:e2e
```

Current harness scripts:

| Script | Purpose | Run When |
|---|---|---|
| `npm run setup:e2e` | Install the current Playwright Chromium browser. | Once per local machine, or when Playwright asks for browser installation. |
| `npm run check:repo` | Required source-of-truth paths and local Markdown links. | Docs, assets, agent context, or product spec changes. |
| `npm run check:runtime` | Focused Runtime / Device Registration unit and script harness. | Runtime inventory model, collector, installer, fixture, or adapter changes. |
| `npm run check:quick` | TypeScript typecheck plus Vitest unit/component tests. | Catalog model, query logic, React behavior, labels, or seed data changes. |
| `npm run check:build` | Production TypeScript/Vite build. | Frontend, dependency, Vite, TypeScript, or package changes. |
| `npm run check:e2e` | Playwright browser harness for core user workflow and responsive layout. | UI interaction paths, layout, toolbar, responsive behavior, navigation shell, or visual regression risk. |
| `npm run verify` | Full harness, same as `./scripts/verify.sh`. | Before handoff, commit, or review. |

Local frontend development:

```sh
npm install
npm run setup:e2e
npm run dev
```

## Change Hygiene

- Prefer focused commits: product docs, object model, frontend, backend, runtime, and verification changes should be easy to review independently.
- Before committing, check `git status --short` and make sure there are no unrelated user changes mixed in.
- If adding generated output later, document the source command and avoid hand-editing generated files.
- Do not claim completion until the relevant harness has passed and the final answer names what was verified.
