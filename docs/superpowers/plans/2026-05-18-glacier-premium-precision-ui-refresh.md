# Glacier Premium Precision UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Lorume's current Cream Arcade visual system with the Glacier Premium Precision direction across public, auth, Console, utility drawer, Runtime Fleet, Skill 管理, Runs, and Organization Settings while preserving real API/data behavior.

**Architecture:** Keep the existing React routes, API calls, query models, and auth flow. Update the design source of truth first, then retheme shared tokens and primitives, then re-layout each page around the existing normalized data models instead of mock data. Treat `/operations` and `/notifications` as deep-linked drawer states over the current Console context, with counts and drawer content backed by the existing Operation and Notification APIs.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright, shared CSS in `src/ui/tokens.css` and `src/styles.css`.

---

## Current Ground Truth

The current product/data surfaces already exist:

- `src/runtime/RuntimeFleetPage.tsx` reads `/api/runtime-fleet`, `/api/runtime-work-items`, and collection health through `runtime-inventory-query.ts`, `runtime-work-query-api.ts`, and `runtime-collection-health.ts`.
- `src/runtime/RuntimeWorkBoardPage.tsx` reads `/api/runtime-work-items` and builds board data through `createRuntimeWorkBoard`.
- `src/skills/SkillRegistryPage.tsx` reads real Skill, assignment, approval, Operation, Notification, Runtime Fleet, and discovery APIs.
- `src/console/ConsoleUtilityDrawer.tsx` already reads `/api/operations` and `/api/notifications`.
- Auth pages use the real email-code, organization, and invitation flow through `src/auth/*`.

The main risk is not data availability. The main risk is visual churn breaking the existing user-verifiable workflows, labels, route behavior, and responsive harness.

---

## File Structure

### Design Source Of Truth

- Modify `AGENTS.md`: update durable UI rule names from Cream Arcade to Glacier Premium Precision.
- Modify `docs/product/ui-design.md`: replace the long-term visual-language paragraph and keep task/notification drawer route rules.
- Modify `docs/product/design/README.md`: update reading order labels.
- Modify `docs/product/design/principles.md`: define modern operations console principles.
- Modify `docs/product/design/visual-language.md`: replace Cream Arcade with Glacier Premium Precision.
- Modify `docs/product/design/color.md`: define palette, semantic color, contrast rules.
- Modify `docs/product/design/tokens.md`: map token names to implementation variables.
- Modify `docs/product/design/typography.md`: replace pixel-font hierarchy with sans/mono hierarchy.
- Modify `docs/product/design/layout.md`: define rail, topbar, surface, summary rail, inspector, drawer dimensions.
- Modify `docs/product/design/components.md`: define buttons, badges, fields, panels, metrics, rows, drawers.
- Modify `docs/product/design/icons-and-assets.md`: state that `Pixel*` filenames are legacy implementation names until a rename pass; visual output is modern line/solid system.
- Modify `docs/product/design/page-patterns.md`: add page-level rules for Home, Auth, Console, Runtime, Skill, Runs, Settings, utility drawers.
- Modify `docs/product/design/review-and-harness.md`: add screenshot and overflow review expectations for the refreshed UI.

### Shared UI And Styles

- Modify `src/ui/tokens.css`: replace Cream Arcade variables with Glacier Premium Precision variables while preserving existing CSS variable entry points where practical.
- Modify `src/styles.css`: rework page shell, public page, auth layout, panels, metrics, drawers, Runtime/Runs/Skill/Settings page classes.
- Modify `src/ui/PixelLogo.tsx`: update logo mark rendering to the modern compact `L` mark and keep accessible label.
- Modify `public/favicon.svg`: keep browser tab icon aligned with `PixelLogo`.
- Modify `src/ui/PixelPanel.tsx`: change metadata from `cut-corner` to a modern surface style.
- Modify `src/ui/PixelButton.tsx`, `src/ui/PixelBadge.tsx`, `src/ui/PixelField.tsx`: preserve public props, retheme classes.
- Modify `src/ui/PixelIcon.tsx`: keep imports stable, ensure icons render as simple modern symbols with existing names.
- Modify `src/ui/PixelDecorations.tsx`: remove decorative pixel sprites from rendered public/auth/console surfaces or reduce it to a non-distracting grid helper.
- Modify `src/ui/ui-tokens.test.tsx`: update assertions from Cream Arcade/pixel expectations to Glacier Premium Precision expectations.

### Routes And Data-Aware Pages

- Modify `src/App.tsx`: integrate topbar utility buttons into the Console shell and pass `organizationId` to the utility bar.
- Modify `src/HomePage.tsx`: replace empty/retro hero with a content-rich product preview backed by current implemented concepts.
- Modify `src/ui/AuthLayout.tsx`: modernize auth composition and keep real form children/preview slots.
- Modify `src/auth/auth-preview.tsx`: update auth preview to match the accepted mock.
- Modify `src/auth/LoginPage.tsx`, `src/auth/VerifyCodePage.tsx`, `src/auth/CreateOrganizationPage.tsx`, `src/auth/InviteJoinPage.tsx`: keep behavior and labels, rely on the refreshed layout.
- Modify `src/console/ConsoleUtilityDrawer.tsx`: make the drawer narrow, remove internal tab UI, keep real API-backed lists/details, and add API-backed count badges in the topbar.
- Modify `src/runtime/RuntimeFleetPage.tsx`: preserve loading/filter/refresh behavior, re-layout snapshot data into summary rail + matrix + inspector.
- Modify `src/runtime/RuntimeWorkBoardPage.tsx`: preserve query/filter/pagination behavior, re-layout board into modern lanes + inspector.
- Modify `src/skills/SkillRegistryPage.tsx`: preserve all real Skill APIs/actions, re-layout into organization Skill list + document detail + target/operations/discovery side stack.
- Modify `src/settings/OrganizationSettingsPage.tsx`: preserve invitation behavior, re-layout into modern organization summary + member list + invite panel.

### Tests And Harness

- Modify `src/App.test.tsx`: update selectors that depend on old layout while keeping route/data assertions.
- Modify `src/auth/auth-pages.test.tsx`: keep behavioral assertions and add auth preview density assertions.
- Modify `src/console/ConsoleUtilityDrawer.test.tsx`: assert separate operations/notifications drawer states, narrow drawer class, and count fetch behavior.
- Modify `src/runtime/runtime-inventory-query.test.ts`, `src/runtime/runtime-work-state-query.test.ts`: no visual changes expected; run to protect data models.
- Modify `src/skills/SkillRegistryPage.test.tsx`: update layout-specific assertions while preserving import/publish/assignment flow assertions.
- Modify `src/settings/OrganizationSettingsPage.test.tsx`: keep invite behavior assertions.
- Modify `e2e/runtime-fleet.spec.ts`, `e2e/runtime-work-board.spec.ts`, `e2e/skill-registry-auth.spec.ts`: update layout expectations and add drawer/topbar checks.

---

## Task 1: Update Design Source Of Truth

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/product/ui-design.md`
- Modify: `docs/product/design/README.md`
- Modify: `docs/product/design/principles.md`
- Modify: `docs/product/design/visual-language.md`
- Modify: `docs/product/design/color.md`
- Modify: `docs/product/design/tokens.md`
- Modify: `docs/product/design/typography.md`
- Modify: `docs/product/design/layout.md`
- Modify: `docs/product/design/components.md`
- Modify: `docs/product/design/icons-and-assets.md`
- Modify: `docs/product/design/page-patterns.md`
- Modify: `docs/product/design/review-and-harness.md`

- [ ] **Step 1: Update the visual-language baseline**

  Replace references that define Cream Arcade as the active direction with Glacier Premium Precision. Keep product object boundaries and current navigation unchanged.

  Required wording for `docs/product/ui-design.md`:

  ```md
  ## 视觉语言

  Lorume 的当前 UI 方向是 **Glacier Premium Precision**：清爽、现代、低噪声的 AgentOps 控制台。它服务于“团队操作台”的产品定位，强调长时间阅读舒适度、可扫描信息密度、真实运行状态和清晰治理边界。

  视觉规范、设计 token、组件规则、页面模式和自验要求以 [design/README.md](design/README.md) 为准。本文档只保留产品对象、信息架构、用户动线和页面职责。
  ```

- [ ] **Step 2: Update durable agent rules**

  In `AGENTS.md`, replace the current Cream Arcade rule with:

  ```md
  - Glacier Premium Precision visual rules belong in `docs/product/design/` and shared UI tokens. Do not scatter one-off color, border, shadow, typography, or spacing decisions across product components.
  ```

  Keep the existing routes and utility-drawer rules unchanged.

- [ ] **Step 3: Update design specs**

  In `docs/product/design/visual-language.md`, define:

  ```md
  # Visual Language

  Lorume uses Glacier Premium Precision: a modern operations console language built from cool white backgrounds, quiet grid texture, hairline borders, compact navigation, cobalt action blue, teal operational signal, restrained amber warnings, and document-like detail surfaces.

  The UI must not rely on retro pixel styling, thick black borders, high-saturation yellow sidebars, decorative sprites, or large empty atmospheric panels.
  ```

  In `docs/product/design/color.md`, include the active palette:

  ```md
  | Role | Token | Value |
  |---|---|---|
  | Page background | `--lorume-color-bg` | `#f7f9fb` |
  | Rail background | `--lorume-color-bg-rail` | `#eef3f7` |
  | Surface | `--lorume-color-surface` | `rgba(255, 255, 255, 0.88)` |
  | Soft surface | `--lorume-color-surface-soft` | `#f4f7fa` |
  | Ink | `--lorume-color-ink` | `#111827` |
  | Muted text | `--lorume-color-muted` | `#667587` |
  | Hairline | `--lorume-color-line` | `#dce5ee` |
  | Primary action | `--lorume-color-action` | `#245bff` |
  | Operational signal | `--lorume-color-accent` | `#12a7a2` |
  | Success | `--lorume-color-success` | `#1f9d68` |
  | Warning | `--lorume-color-warning` | `#b7791f` |
  | Danger | `--lorume-color-danger` | `#d64b55` |
  ```

- [ ] **Step 4: Run docs checks**

  Run: `npm run check:repo`

  Expected: exits `0`, with no missing required source-of-truth paths or broken local Markdown links.

- [ ] **Step 5: Commit docs**

  ```bash
  git add AGENTS.md docs/product/ui-design.md docs/product/design
  git commit -m "docs(design): define glacier premium precision system"
  ```

---

## Task 2: Retheme Shared Tokens And UI Primitives

**Files:**
- Modify: `src/ui/tokens.css`
- Modify: `src/styles.css`
- Modify: `src/ui/PixelLogo.tsx`
- Modify: `public/favicon.svg`
- Modify: `src/ui/PixelPanel.tsx`
- Modify: `src/ui/PixelButton.tsx`
- Modify: `src/ui/PixelBadge.tsx`
- Modify: `src/ui/PixelField.tsx`
- Modify: `src/ui/PixelIcon.tsx`
- Modify: `src/ui/PixelDecorations.tsx`
- Modify: `src/ui/ui-tokens.test.tsx`

- [ ] **Step 1: Write failing token tests**

  Update `src/ui/ui-tokens.test.tsx` suite name and token assertions:

  ```ts
  describe("Glacier Premium Precision UI primitives", () => {
    it("defines the current sans, mono, color, radius, border, and shadow roles", () => {
      const tokens = readFileSync("src/ui/tokens.css", "utf8");
      const appStyles = readFileSync("src/styles.css", "utf8");
      const styles = `${tokens}\n${appStyles}`;

      expect(tokens).toContain("--lorume-color-bg: #f7f9fb");
      expect(tokens).toContain("--lorume-color-action: #245bff");
      expect(tokens).toContain("--lorume-color-accent: #12a7a2");
      expect(tokens).toContain("--lorume-border-hairline: 1px solid var(--lorume-color-line)");
      expect(tokens).toContain("--lorume-radius-lg: 18px");
      expect(styles).toMatch(/\\.metricCard strong\\s*{[^}]*font-family:\\s*var\\(--lorume-font-mono\\)/s);
      expect(styles).not.toContain("box-shadow: 7px 7px 0");
    });
  });
  ```

- [ ] **Step 2: Run token test to verify it fails**

  Run: `npm run test:run -- src/ui/ui-tokens.test.tsx`

  Expected: FAIL because the current token file still contains Cream Arcade colors, pixel shadows, and cut-corner assertions.

- [ ] **Step 3: Replace token variables**

  In `src/ui/tokens.css`, define these variables in `:root` and keep backward-compatible aliases only when needed by existing class names:

  ```css
  :root {
    --font-sans: "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    --font-mono: "JetBrains Mono", "Sarasa Mono SC", "SFMono-Regular", "Cascadia Code", "Roboto Mono", ui-monospace, monospace;
    --lorume-font-body: var(--font-sans);
    --lorume-font-mono: var(--font-mono);

    --lorume-color-bg: #f7f9fb;
    --lorume-color-bg-rail: #eef3f7;
    --lorume-color-surface: rgba(255, 255, 255, 0.88);
    --lorume-color-surface-soft: #f4f7fa;
    --lorume-color-surface-blue: #f2f7ff;
    --lorume-color-ink: #111827;
    --lorume-color-muted: #667587;
    --lorume-color-faint: #94a3b5;
    --lorume-color-line: #dce5ee;
    --lorume-color-line-strong: #b8c5d3;
    --lorume-color-action: #245bff;
    --lorume-color-action-dark: #163fc2;
    --lorume-color-accent: #12a7a2;
    --lorume-color-success: #1f9d68;
    --lorume-color-warning: #b7791f;
    --lorume-color-danger: #d64b55;

    --lorume-radius-sm: 9px;
    --lorume-radius-md: 13px;
    --lorume-radius-lg: 18px;
    --lorume-border-hairline: 1px solid var(--lorume-color-line);
    --lorume-shadow-soft: 0 16px 44px rgba(19, 32, 50, 0.055);
    --lorume-shadow-float: 0 18px 50px rgba(19, 32, 50, 0.1);

    --lorume-space-1: 4px;
    --lorume-space-2: 8px;
    --lorume-space-3: 12px;
    --lorume-space-4: 16px;
    --lorume-space-5: 24px;
    --lorume-space-6: 32px;
  }
  ```

- [ ] **Step 4: Retheme primitives without changing public props**

  Keep component imports stable. Update visual output:

  - `PixelPanel` renders `data-panel-style="precision-surface"`.
  - `PixelButton` keeps `variant="primary" | "secondary" | "danger"`.
  - `PixelBadge` keeps `tone="neutral" | "success" | "warning" | "danger"`.
  - `PixelField` keeps label/input association.
  - `PixelLogo` keeps `aria-label="Lorume"` and `data-logo-mark="lorume-neural-lumen"`, but the visual mark becomes the compact dark rounded square with `L`.

- [ ] **Step 5: Align favicon**

  Update `public/favicon.svg` so it still contains:

  ```svg
  data-logo-mark="lorume-neural-lumen"
  data-logo-version="lorume-v1"
  ```

  Its visible shape should match the compact modern mark.

- [ ] **Step 6: Run token tests**

  Run: `npm run test:run -- src/ui/ui-tokens.test.tsx`

  Expected: PASS.

- [ ] **Step 7: Commit shared UI primitives**

  ```bash
  git add src/ui public/favicon.svg src/styles.css
  git commit -m "style(ui): retheme shared primitives for glacier precision"
  ```

---

## Task 3: Modernize Console Shell And Utility Drawers

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/console/ConsoleUtilityDrawer.tsx`
- Modify: `src/console/ConsoleUtilityDrawer.test.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing utility tests**

  In `src/console/ConsoleUtilityDrawer.test.tsx`, add assertions for separate drawer states:

  ```ts
  expect(screen.queryByRole("tablist", { name: "工具切换" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "任务" })).toHaveClass("utilityDrawer");
  expect(screen.getByRole("heading", { name: "任务" })).toBeInTheDocument();
  ```

  Add a `ConsoleUtilityBar` test that passes `organizationId="org_1"` and mocks:

  ```ts
  /api/operations?organizationId=org_1&limit=100
  /api/notifications?organizationId=org_1
  ```

  Assert the buttons render `任务 2` and `通知 1` based on active operations and unread notifications.

- [ ] **Step 2: Run failing drawer tests**

  Run: `npm run test:run -- src/console/ConsoleUtilityDrawer.test.tsx`

  Expected: FAIL because the drawer still has tab UI and the bar does not fetch count badges.

- [ ] **Step 3: Make utility bar data-aware**

  Change the props:

  ```ts
  interface ConsoleUtilityBarProps {
    activeView: ConsoleUtilityView | null;
    organizationId?: string;
    onOpen: (view: ConsoleUtilityView) => void;
  }
  ```

  In `ConsoleUtilityBar`, fetch real counts every 30 seconds when `organizationId` exists:

  ```ts
  const operationCount = operations.filter((operation) => activeOperationStatuses.has(operation.status)).length;
  const notificationCount = notifications.filter((notification) => !notification.isRead).length;
  ```

  Render two buttons labeled `任务` and `通知`, each with a visible badge count.

- [ ] **Step 4: Update `App.tsx` wiring**

  Pass the organization:

  ```tsx
  <ConsoleUtilityBar activeView={utilityView} organizationId={organizationId} onOpen={openUtility} />
  ```

  Keep `/operations` and `/notifications` deep-link behavior exactly as implemented today.

- [ ] **Step 5: Narrow the drawer and remove internal tabs**

  In `ConsoleUtilityDrawer`, change title labels to `任务` and `通知`, remove `utilityDrawerTabs`, and keep the current `onViewChange` prop only for route compatibility until a later cleanup.

  CSS target:

  ```css
  .utilityDrawer {
    width: min(440px, calc(100vw - 16px));
    border-left: var(--lorume-border-hairline);
    box-shadow: var(--lorume-shadow-float);
  }

  .utilitySplit {
    grid-template-columns: 1fr;
  }
  ```

- [ ] **Step 6: Run focused tests**

  Run: `npm run test:run -- src/console/ConsoleUtilityDrawer.test.tsx src/App.test.tsx`

  Expected: PASS.

- [ ] **Step 7: Commit shell and drawers**

  ```bash
  git add src/App.tsx src/console/ConsoleUtilityDrawer.tsx src/console/ConsoleUtilityDrawer.test.tsx src/App.test.tsx src/styles.css
  git commit -m "style(console): modernize utility drawer entry points"
  ```

---

## Task 4: Rebuild Public Home And Auth Surfaces

**Files:**
- Modify: `src/HomePage.tsx`
- Modify: `src/ui/AuthLayout.tsx`
- Modify: `src/auth/auth-preview.tsx`
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/VerifyCodePage.tsx`
- Modify: `src/auth/CreateOrganizationPage.tsx`
- Modify: `src/auth/InviteJoinPage.tsx`
- Modify: `src/auth/auth-pages.test.tsx`
- Modify: `src/ui/ui-tokens.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing Home/Auth assertions**

  In `src/auth/auth-pages.test.tsx`, add:

  ```ts
  expect(screen.getByLabelText("运营概览")).toHaveTextContent("任务与通知");
  expect(screen.getByLabelText("运营概览")).toHaveTextContent("Runtime Fleet");
  ```

  In `src/ui/ui-tokens.test.tsx`, update the `AuthLayout` test to assert no decorative sprite requirements:

  ```ts
  expect(screen.queryByTestId("auth-pixel-decorations")).not.toBeInTheDocument();
  expect(screen.getByText(/登录后可统一管理组织内 Device/)).toBeInTheDocument();
  ```

- [ ] **Step 2: Run failing auth tests**

  Run: `npm run test:run -- src/auth/auth-pages.test.tsx src/ui/ui-tokens.test.tsx`

  Expected: FAIL because the current auth preview and layout still use the old decorative primitives.

- [ ] **Step 3: Update Home content**

  Use the accepted mock structure:

  - Left: brand value prop, actions, platform tags.
  - Right: control-plane preview with Runtime, Agent, Runs, Alerts, Runtime Fleet rows, and selected operation preview.

  Preserve the routes:

  ```tsx
  <a href="/login">开始使用</a>
  <a href="/runs">查看 Runs</a>
  ```

- [ ] **Step 4: Update AuthLayout**

  Keep `children`, `notice`, `preview`, `subtitle`, and `title` props. Remove `PixelDecorations` from the layout. Use the preview slot as the right-side operations preview.

- [ ] **Step 5: Update auth preview**

  In `src/auth/auth-preview.tsx`, render rows for:

  ```ts
  ["Runtime Fleet", "在线 5 · 离线 0 · 异常 0", "健康"]
  ["Runs", "总数 1,248 · 成功 96.3% · 6 个执行中", "工作中"]
  ["任务与通知", "2 个待处理任务 · 2 条未读通知 · 抽屉内处理", "待看"]
  ["Collectors", "健康 23 · 警告 1 · 异常 0", "在线"]
  ```

  These are product preview values, not API values, because the user is not authenticated on auth pages.

- [ ] **Step 6: Run focused auth tests**

  Run: `npm run test:run -- src/auth/auth-pages.test.tsx src/ui/ui-tokens.test.tsx`

  Expected: PASS.

- [ ] **Step 7: Commit public/auth surfaces**

  ```bash
  git add src/HomePage.tsx src/ui/AuthLayout.tsx src/auth src/ui/ui-tokens.test.tsx src/styles.css
  git commit -m "style(auth): refresh public and identity surfaces"
  ```

---

## Task 5: Re-layout Runtime Fleet With Existing Snapshot Data

**Files:**
- Modify: `src/runtime/RuntimeFleetPage.tsx`
- Modify: `src/App.test.tsx`
- Modify: `e2e/runtime-fleet.spec.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing layout assertions**

  In `src/App.test.tsx`, keep the real fetch mocks and add assertions:

  ```ts
  expect(await screen.findByRole("heading", { name: "运行资产" })).toBeInTheDocument();
  expect(screen.getByLabelText("运行资产概览")).toHaveTextContent("设备");
  expect(screen.getByLabelText("Runtime Matrix")).toBeInTheDocument();
  expect(screen.getByLabelText("运行资产详情")).toBeInTheDocument();
  ```

- [ ] **Step 2: Run failing Runtime test**

  Run: `npm run test:run -- src/App.test.tsx -t "Runtime Fleet"`

  Expected: FAIL because the current markup does not expose the refreshed regions.

- [ ] **Step 3: Re-layout without changing data calls**

  Keep these existing functions and state:

  - `fetchLatestSnapshot`
  - `fetchLatestWorkStateSnapshot`
  - `fetchCollectionHealth`
  - `summarizeRuntimeFleet`
  - `filterRuntimeFleet`
  - `getRuntimeFleetDetail`

  Render:

  - `aria-label="运行资产概览"` summary rail from `summary`.
  - `aria-label="Runtime Matrix"` for filtered runtimes/devices/agents.
  - `aria-label="运行资产详情"` for selected `RuntimeFleetDetail`.

- [ ] **Step 4: Preserve refresh behavior**

  Keep `handleRefresh` and the refresh button label logic. The visible status message must still use `refreshState.message`.

- [ ] **Step 5: Run focused Runtime tests**

  Run: `npm run test:run -- src/App.test.tsx src/runtime/runtime-inventory-query.test.ts src/runtime/runtime-collection-health.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit Runtime Fleet**

  ```bash
  git add src/runtime/RuntimeFleetPage.tsx src/App.test.tsx e2e/runtime-fleet.spec.ts src/styles.css
  git commit -m "style(runtime): refresh runtime fleet layout"
  ```

---

## Task 6: Re-layout Runs Work Board With Existing Query Data

**Files:**
- Modify: `src/runtime/RuntimeWorkBoardPage.tsx`
- Modify: `src/App.test.tsx`
- Modify: `e2e/runtime-work-board.spec.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing Runs assertions**

  In `src/App.test.tsx`, add:

  ```ts
  expect(await screen.findByRole("heading", { name: "工作看板" })).toBeInTheDocument();
  expect(screen.getByLabelText("工作项概览")).toHaveTextContent("看板项");
  expect(screen.getByLabelText("工作泳道")).toBeInTheDocument();
  expect(screen.getByLabelText("工作项详情")).toBeInTheDocument();
  ```

- [ ] **Step 2: Run failing Runs test**

  Run: `npm run test:run -- src/App.test.tsx -t "Runs"`

  Expected: FAIL because refreshed region labels do not exist yet.

- [ ] **Step 3: Re-layout without changing query logic**

  Keep:

  - `fetchLatestSnapshot`
  - `createRuntimeWorkBoard`
  - `createWorkItemsQueryUrl`
  - pagination through `nextCursor`
  - time range popover behavior

  Render:

  - `aria-label="工作项概览"` from `board` and `displayedTotal`.
  - `aria-label="工作泳道"` for lanes from `board.lanes`.
  - `aria-label="工作项详情"` from `selectedItem`.

- [ ] **Step 4: Preserve user-facing ID rules**

  Do not display raw DingTalk `cid...`, phone numbers, open conversation ids, bearer tokens, device tokens, or raw payload values.

- [ ] **Step 5: Run focused Runs tests**

  Run: `npm run test:run -- src/App.test.tsx src/runtime/runtime-work-query-api.test.ts src/runtime/runtime-work-state-query.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit Runs**

  ```bash
  git add src/runtime/RuntimeWorkBoardPage.tsx src/App.test.tsx e2e/runtime-work-board.spec.ts src/styles.css
  git commit -m "style(runs): refresh work board layout"
  ```

---

## Task 7: Re-layout Skill 管理 With Existing Governance Data

**Files:**
- Modify: `src/skills/SkillRegistryPage.tsx`
- Modify: `src/skills/SkillRegistryPage.test.tsx`
- Modify: `e2e/skill-registry-auth.spec.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing Skill layout assertions**

  In `src/skills/SkillRegistryPage.test.tsx`, add:

  ```ts
  expect(await screen.findByRole("heading", { name: "Skill 管理" })).toBeInTheDocument();
  expect(screen.getByLabelText("Skill 概览")).toHaveTextContent("组织 Skill");
  expect(screen.getByLabelText("组织 Skill")).toBeInTheDocument();
  expect(screen.getByLabelText("Skill 详情")).toBeInTheDocument();
  expect(screen.getByLabelText("目标 Skill Set")).toBeInTheDocument();
  ```

- [ ] **Step 2: Run failing Skill test**

  Run: `npm run test:run -- src/skills/SkillRegistryPage.test.tsx`

  Expected: FAIL because the refreshed regions do not exist yet.

- [ ] **Step 3: Preserve all real data loading**

  Keep the existing `Promise.all` loader for:

  - `/api/skills`
  - `/api/skill-assignments`
  - `/api/approval-requests`
  - `/api/operations?resourceType=skill`
  - `/api/notifications`
  - `/api/runtime-fleet`
  - `/api/skill-discoveries`

- [ ] **Step 4: Re-layout Skill content**

  Render:

  - `aria-label="Skill 概览"` metrics from `skills`, `approvals`, `operations`, and `targetSkillSet`.
  - `aria-label="组织 Skill"` list from `skills`.
  - `aria-label="Skill 详情"` document/editor area from `detail`, `files`, and `latestVersion`.
  - `aria-label="目标 Skill Set"` from `targetSkillSet`.
  - `aria-label="设备发现 Skill"` from `skillDiscoveries`.
  - `aria-label="Skill 操作"` from `operations`.

  Keep import, promote, publish, assignment, sync, archive, delete, editor preview/source, and target Skill Set behaviors unchanged.

- [ ] **Step 5: Keep unsupported capabilities hidden**

  Do not expose new buttons for unimplemented pages such as Agent Studio, Workflow Studio, Object Catalog, People, Integrations, or Governance Center.

- [ ] **Step 6: Run focused Skill tests**

  Run: `npm run test:run -- src/skills/SkillRegistryPage.test.tsx src/App.test.tsx`

  Expected: PASS.

- [ ] **Step 7: Commit Skill page**

  ```bash
  git add src/skills/SkillRegistryPage.tsx src/skills/SkillRegistryPage.test.tsx e2e/skill-registry-auth.spec.ts src/styles.css
  git commit -m "style(skills): refresh skill registry workspace"
  ```

---

## Task 8: Re-layout Organization Settings

**Files:**
- Modify: `src/settings/OrganizationSettingsPage.tsx`
- Modify: `src/settings/OrganizationSettingsPage.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing settings assertions**

  In `src/settings/OrganizationSettingsPage.test.tsx`, add:

  ```ts
  expect(screen.getByLabelText("组织概览")).toHaveTextContent("当前角色");
  expect(screen.getByLabelText("组织成员")).toBeInTheDocument();
  expect(screen.getByLabelText("邀请成员")).toBeInTheDocument();
  ```

- [ ] **Step 2: Run failing settings test**

  Run: `npm run test:run -- src/settings/OrganizationSettingsPage.test.tsx`

  Expected: FAIL if refreshed labels/classes are not present.

- [ ] **Step 3: Re-layout without changing invite API behavior**

  Keep:

  ```ts
  fetch(`/api/organizations/${encodeURIComponent(organization.organizationId)}/invitations`, {
    body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  ```

  Render the existing organization/session data in the refreshed summary + member + invite layout.

- [ ] **Step 4: Run focused settings tests**

  Run: `npm run test:run -- src/settings/OrganizationSettingsPage.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Commit Settings**

  ```bash
  git add src/settings/OrganizationSettingsPage.tsx src/settings/OrganizationSettingsPage.test.tsx src/styles.css
  git commit -m "style(settings): refresh organization settings"
  ```

---

## Task 9: Responsive And Browser Harness Pass

**Files:**
- Modify: `e2e/runtime-fleet.spec.ts`
- Modify: `e2e/runtime-work-board.spec.ts`
- Modify: `e2e/skill-registry-auth.spec.ts`
- Modify: `docs/product/design/review-and-harness.md`

- [ ] **Step 1: Update e2e expectations**

  Keep real workflow expectations, but update visual/layout checks to target:

  - compact rail navigation
  - top-right `任务` and `通知` buttons
  - narrow right drawer
  - no body-level horizontal overflow on desktop and mobile
  - visible summary rail and detail inspector on each Console page

- [ ] **Step 2: Run quick harness**

  Run: `npm run check:quick`

  Expected: PASS.

- [ ] **Step 3: Run browser harness**

  Run: `npm run check:e2e`

  Expected: PASS for Runtime Fleet and Runs browser flows.

- [ ] **Step 4: Run auth browser harness**

  Run: `npm run check:e2e:auth`

  Expected: PASS for protected Skill 管理 import and publish-queue flow.

- [ ] **Step 5: Commit harness updates**

  ```bash
  git add e2e docs/product/design/review-and-harness.md
  git commit -m "test(ui): update refreshed console browser harness"
  ```

---

## Task 10: Final Verification And Integration

**Files:**
- Inspect: full working tree

- [ ] **Step 1: Run full harness**

  Run: `npm run verify`

  Expected: PASS. This covers repo docs, migrations, backend, runtime, TypeScript, unit/component tests, build, and Playwright harness.

- [ ] **Step 2: Inspect final diff**

  Run:

  ```bash
  git status --short
  git diff --stat
  git diff -- src/ui/tokens.css src/styles.css src/App.tsx src/console/ConsoleUtilityDrawer.tsx
  ```

  Expected:

  - No unrelated files.
  - No secrets or raw tokens.
  - No one-off color values in page components.
  - No fake routes for unimplemented future surfaces.

- [ ] **Step 3: Confirm worktree isolation**

  Run:

  ```bash
  git branch --show-current
  git worktree list
  ```

  Expected: current branch is `codex/ui-refresh-design-system`, and main project checkout remains separate.

- [ ] **Step 4: Prepare merge handoff**

  If the other agent's task has landed, merge or rebase from the target branch into this worktree, resolve conflicts in design docs, `src/styles.css`, and shared UI files carefully, then rerun:

  ```bash
  npm run check:quick
  npm run check:e2e
  npm run check:e2e:auth
  ```

  Expected: all three commands pass after conflict resolution.

---

## Self-Review

- Spec coverage: The plan covers design docs, tokens, shared primitives, public pages, auth pages, Console shell, utility drawers, Runtime Fleet, Runs, Skill 管理, Organization Settings, tests, e2e, and final verification.
- Real data coverage: Runtime Fleet, Runs, Skill 管理, Operations, Notifications, Settings, and Auth keep their current API/query/data-store paths; only the public/auth preview uses static product preview values because unauthenticated users cannot read organization data.
- Placeholder scan: The plan contains no placeholder markers, no open-ended implementation steps, and every task has exact files, commands, and expected outcomes.
- Type consistency: Existing exported component names and route types remain stable. `ConsoleUtilityBar` gets one new optional `organizationId` prop, and `App.tsx` passes the existing organization id.
