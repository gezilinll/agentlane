# Agentlane Agent Guide

Root guide for coding agents working in this repository. Keep this file short and practical; add scoped guides only when real code areas appear and need local rules.

## Project State

Agentlane is currently in product definition and early engineering setup. The repository is becoming the control plane for operating an Agent Network, but it is not yet an implemented frontend/backend/runtime system.

Current source of truth:

- `README.md`: public project overview and operating model.
- `docs/product/ui-design.md`: product object model, information architecture, pages, flows, and implementation priorities.
- `docs/product/agent-network-runtime-panorama.png`: runtime panorama.
- `docs/product/agent-network-build-objects.png`: build object map.
- `assets/product-ui/`: UI and flow design assets.

## Working Rules

- Preserve the boundary between product docs and team execution plans. Do not add internal rollout plans, owner assignments, or temporary team checklists to the repo unless the user explicitly asks.
- Treat Workflow, Domain Agent, Semantic Coordinator, Runtime / Execution Fabric, Registry / Catalog, Governance, and Lifecycle definitions in `docs/product/ui-design.md` as the product baseline.
- Keep changes proportional to the current phase. Do not create empty framework directories, speculative services, broad schemas, or placeholder platforms before they are needed.
- Use semantic filenames for durable assets. Avoid leaving uploaded image names with spaces or copy suffixes when the asset becomes part of product documentation.
- When code directories appear, add scoped `AGENTS.md` files only where local commands, boundaries, or ownership differ from this root guide.

## Agent-Ready Growth

Agentlane should become agent-ready by growing only the infrastructure the project actually needs. The current layer is **Agent Context Ready**: this root guide, one lightweight verification command, and product object boundaries in `docs/product/ui-design.md`.

Extend this guide and `./scripts/verify.sh` only when a real project surface appears:

- Frontend code: add frontend commands and checks; add a scoped guide only if local rules differ.
- Backend service: add API, schema, migration, and contract checks.
- Catalog object models: document the schema source of truth and generated-file policy if any.
- Runtime / Execution Fabric: add worker setup, sandbox, queue, health-check, and artifact rules.
- PR or release flow: add the smallest useful gates for owner review, approval boundary, audit evidence, and rollback notes.

Do not add empty `specs/`, `evals/`, `harnesses/`, service directories, heavyweight spec frameworks, or generic agent platform rules before Agentlane has an Agentlane-specific need.

## Verification

Run the current lightweight repository check before handing off doc or asset changes:

```sh
./scripts/verify.sh
```

The check is intentionally small today: it verifies required product documents/assets and local Markdown links. As frontend, backend, catalog, and runtime code land, extend this same entry point with the real lint, typecheck, test, build, and runtime checks.

## Change Hygiene

- Prefer focused commits: product docs, object model, frontend, backend, runtime, and verification changes should be easy to review independently.
- Before committing, check `git status --short` and make sure there are no unrelated user changes mixed in.
- If adding generated output later, document the source command and avoid hand-editing generated files.
