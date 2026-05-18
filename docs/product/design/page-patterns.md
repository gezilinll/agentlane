# Page Patterns

Page specs define the visual, content, and interaction boundaries for current surfaces. Add new pages here before implementation.

## Home

Purpose: Explain Lorume as an Agent Network control plane and show implemented Runtime Fleet, Skill 管理, Runs, Organization Settings, and utility drawer capabilities.

Rules:

- First viewport must show both the value proposition and a concrete product preview.
- The preview must contain real current product objects such as Runtime, Agent, Runs, alerts, tasks, or notifications.
- CTA links only point to implemented paths.
- Do not expose future modules as clickable product UI.
- Avoid giant empty panels, decorative-only gradients, or abstract hero art.

## Login

Purpose: Email-code login.

Rules:

- The page focuses one identity task.
- The operations preview is compact and shows current product concepts, not live organization data.
- Backend session probe errors are surfaced only when unexpected; anonymous probe errors stay quiet.
- Form labels are visible and controls have clear focus/loading/error states.

## Verify Code

Purpose: Verify an emailed login code.

Rules:

- The user sees which email receives the code.
- The code field supports paste and direct correction.
- Back/change-email action is visible but secondary.

## Create Organization

Purpose: Create the first organization when a signed-in user has no organization.

Rules:

- Explain that organization scope owns Device, Runtime, Agent, Skill, and work state.
- Keep the form short: organization name and slug.
- After creation, return to the intended Console page.

## Invite

Purpose: Join an organization through an invitation link.

Rules:

- Explain the invited organization and email context.
- Do not show raw invitation token.
- Expired, mismatched, already joined, and accepted states need explicit text.

## Skill 管理

Purpose: Manage organization Skill assets, discovered target Skills, target Skill Sets, approvals, sync operations, and notifications.

Rules:

- Organization Skill, discovered Skill, target Skill Set, approval, Operation, and Notification regions must be visually distinct.
- Skill detail is document-like and supports source/preview, version, files, permissions, assignments, and operations.
- Runtime Fleet Agent detail can link to `查看 Skill` and `刷新 Skill 清单`; it cannot bypass Skill 管理 assignment rules.
- URL `targetType` / `targetId` preselection waits for Runtime Fleet target data before selecting.
- Editing, publishing, assignment, and sync actions must map to existing API, permission, and harness paths.

## Runtime Fleet

Purpose: View Device, Runtime, Agent, collection health, recent sync, availability, and operating status.

Rules:

- Runtime and Channel are separate concepts.
- Runtime Fleet does not provide Channel filtering.
- Availability and operating status use Lorume-owned semantics.
- The layout should expose summary rail, Runtime matrix/list, Agent coverage, collection health, and a detail inspector.
- Exceptions and unknown states must be traceable in ingestion/logging without dumping debug data into UI.

## Runs / Work Board

Purpose: View Agent work items, creator, Channel, conversation/group, message summary, current stage, and selected details.

Rules:

- The board only shows real work items.
- Do not render listener status, raw execution records, adapter evidence, or debugging notes as task cards.
- Runtime and Channel filters are separate.
- Channel options are derived from real data.
- Time range supports quick, custom, and clear states.
- Long text wraps or clamps without body-level horizontal scroll.
- Raw IDs, `cid...`, phone numbers, and opaque conversation IDs are not used as conversation names.
- Wide screens keep the selected detail inspector visible.

## Operations Utility Drawer

Purpose: View asynchronous Operation / Job status, resource, target, errors, and recent updates.

Rules:

- Opens from the top-right `任务` button; `/operations` is a deep-link drawer route.
- It is not a primary nav page and has no internal task/notification tab switcher.
- Drawer width is narrow by default and uses vertical list + selected detail.
- Reads organization-scoped data; no organization means no API request.
- Does not show backend raw payload, tokens, device secrets, or debug fields.
- Closing returns to the previous Console context.

## Notifications Utility Drawer

Purpose: View sync, collection, approval, and recovery notification threads.

Rules:

- Opens from the top-right `通知` button; `/notifications` is a deep-link drawer route.
- It is not a primary nav page and has no internal task/notification tab switcher.
- Drawer width is narrow by default and uses vertical thread list + selected detail.
- Reads organization-scoped data; no organization means no API request.
- Selecting an unread thread marks it as read.
- The drawer is a triage/recovery entry, not a replacement for full logs.

## Organization Settings

Purpose: View current organization, member identity, and create invitation links.

Rules:

- No-organization state points users to create or accept invitation flows.
- Owner/admin can create invitation links; other roles see read-only identity.
- Invitation links display only to the current operator and must not be logged or copied into committed screenshots.
