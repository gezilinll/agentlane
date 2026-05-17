import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillRegistryPage } from "./SkillRegistryPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const skillListResponse = {
  skills: [
    {
      id: "skill_cost",
      organizationId: "org_1",
      slug: "cost-review",
      name: "Cost Review",
      description: "检查成本与效率异常",
      ownerUserId: "user_1",
      status: "published",
      source: { type: "upload_md", filename: "SKILL.md" },
      createdAt: "2026-05-14T08:00:00.000Z",
      updatedAt: "2026-05-14T08:10:00.000Z",
      latestVersion: "1",
      latestValidationStatus: "passed",
    },
  ],
};

const skillDetailResponse = {
  skill: skillListResponse.skills[0],
  versions: [
    {
      id: "skillver_cost_1",
      skillId: "skill_cost",
      version: "1",
      packageHash: "hash_1",
      summary: null,
      createdByUserId: "user_1",
      publishedByUserId: null,
      publishedAt: "2026-05-14T08:12:00.000Z" as string | null,
      validationStatus: "passed",
      validationResult: { status: "passed", findings: [] },
      createdAt: "2026-05-14T08:10:00.000Z",
    },
  ],
  files: [
    {
      id: "skillfile_1",
      skillVersionId: "skillver_cost_1",
      path: "SKILL.md",
      content: "# Cost Review\n检查成本与效率异常。",
      contentHash: "hash_file_1",
      sizeBytes: 28,
      createdAt: "2026-05-14T08:10:00.000Z",
    },
  ],
};

const runtimeFleetResponse = {
  observedAt: "2026-05-14T08:30:00.000Z",
  devices: [
    {
      id: "gezilinll-claw",
      name: "gezilinll-claw",
      hostname: "gezilinll-claw.local",
      os: "darwin",
      status: "online",
      connectionMode: "collector",
      lastSeenAt: "2026-05-14T08:30:00.000Z",
    },
  ],
  runtimes: [
    {
      id: "gezilinll-claw:openclaw:gateway-local",
      deviceId: "gezilinll-claw",
      kind: "openclaw",
      name: "OpenClaw Gateway",
      status: "online",
      capabilities: [],
      sourceRefs: [],
      lastSeenAt: "2026-05-14T08:30:00.000Z",
    },
  ],
  agents: [
    {
      id: "gezilinll-claw:openclaw:gateway-local:agent:main",
      runtimeId: "gezilinll-claw:openclaw:gateway-local",
      name: "main",
      origin: "openclaw",
      status: "idle",
      channelBindings: [],
      sourceRefs: [],
      lastSeenAt: "2026-05-14T08:30:00.000Z",
    },
  ],
};

const skillDiscoveriesResponse = {
  skillDiscoveries: [
    {
      id: "gezilinll-claw:openclaw:gateway-local:agent:main:skill:review",
      deviceId: "gezilinll-claw",
      source: "openclaw",
      targetType: "agent",
      targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      targetName: "main",
      runtimeId: "gezilinll-claw:openclaw:gateway-local",
      agentId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      name: "Review Skill",
      description: "Review local changes.",
      packageHash: "hash-review",
      skillPath: "/Users/dev/.openclaw/skills/review",
      lastSeenAt: "2026-05-14T08:31:00.000Z",
    },
  ],
};

const pendingApprovalsResponse = {
  approvalRequests: [
    {
      id: "approval_1",
      action: "assign_skill",
      skillId: "skill_cost",
      targetType: "agent",
      targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      riskLevel: "medium",
      riskSummary: "需要目标 owner 审批后才能分配到 main。",
      status: "pending",
      createdAt: "2026-05-14T08:18:00.000Z",
    },
  ],
};
type ApprovalsResponse = {
  approvalRequests: typeof pendingApprovalsResponse.approvalRequests;
};
type AssignmentsResponse = {
  assignments: Array<{
    id: string;
    skillId: string;
    skillVersionId: string;
    status: string;
    targetId: string;
    targetType: string;
    updatedAt: string;
  }>;
};
const emptyAssignmentsResponse: AssignmentsResponse = { assignments: [] };
const approvedAssignmentsResponse = {
  assignments: [
    {
      id: "assignment_1",
      skillId: "skill_cost",
      skillVersionId: "skillver_cost_1",
      targetType: "agent",
      targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      status: "approved",
      updatedAt: "2026-05-14T08:19:00.000Z",
    },
  ],
};
const targetSkillSetResponse = {
  target: {
    id: "gezilinll-claw:openclaw:gateway-local:agent:main",
    name: "main",
    type: "agent",
  },
  targetLineage: [
    { targetId: "gezilinll-claw", targetType: "device" },
    { targetId: "gezilinll-claw:openclaw:gateway-local", targetType: "runtime" },
    { targetId: "gezilinll-claw:openclaw:gateway-local:agent:main", targetType: "agent" },
  ],
  targetSkillSet: [
    {
      id: "assignment_1",
      skillId: "skill_cost",
      skillVersionId: "skillver_cost_1",
      targetType: "agent",
      targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      status: "approved",
      resolutionState: "pending_sync",
      overriddenAssignmentIds: [],
      updatedAt: "2026-05-14T08:19:00.000Z",
    },
  ],
};
const emptyApprovalsResponse: ApprovalsResponse = { approvalRequests: [] };
const operationsResponse = {
  operations: [
    {
      id: "op_publish_1",
      organizationId: "org_1",
      type: "skill_publish",
      status: "queued",
      resourceType: "skill",
      resourceId: "skill_cost",
      targetType: null,
      targetId: null,
      requestedByUserId: "user_1",
      summary: "发布 Skill：Cost Review",
      metadata: {},
      createdAt: "2026-05-14T08:20:00.000Z",
      updatedAt: "2026-05-14T08:20:00.000Z",
    },
  ],
};
const notificationsResponse = {
  threads: [
    {
      id: "thread_1",
      organizationId: "org_1",
      dedupeKey: "operation:op_publish_1:queued",
      status: "open",
      severity: "info",
      eventType: "operation_status_changed",
      title: "Skill 发布已排队",
      latestSummary: "Cost Review 等待发布任务执行。",
      occurrenceCount: 1,
      firstOccurredAt: "2026-05-14T08:20:00.000Z",
      lastOccurredAt: "2026-05-14T08:20:00.000Z",
      createdAt: "2026-05-14T08:20:00.000Z",
      updatedAt: "2026-05-14T08:20:00.000Z",
    },
  ],
};

function installSkillRegistryFetchMock(options: {
  approvals?: ApprovalsResponse;
  assignments?: AssignmentsResponse;
  detail?: typeof skillDetailResponse;
} = {}) {
  const detailResponse = options.detail ?? skillDetailResponse;
  const approvalsResponse = options.approvals ?? emptyApprovalsResponse;
  const assignmentsResponse = options.assignments ?? emptyAssignmentsResponse;
  const calls: Array<{ body?: unknown; method: string; url: string }> = [];
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = input.toString();
    const method = init?.method ?? "GET";
    calls.push({
      body: init?.body ? JSON.parse(init.body.toString()) : undefined,
      method,
      url,
    });
    if (url.includes("/api/skills/import") && method === "POST") {
      return jsonResponse({
        skill: { ...skillListResponse.skills[0], id: "skill_new", name: "Imported Skill" },
        version: { ...skillDetailResponse.versions[0], id: "skillver_new", skillId: "skill_new" },
        files: skillDetailResponse.files,
      }, 201);
    }
    if (url.includes("/api/skill-discoveries/gezilinll-claw%3Aopenclaw%3Agateway-local%3Aagent%3Amain%3Askill%3Areview/promote") && method === "POST") {
      return jsonResponse({
        skill: {
          ...skillListResponse.skills[0],
          id: "skill_review",
          name: "Review Skill",
          source: { type: "device_discovery", filename: "review" },
        },
        version: { ...skillDetailResponse.versions[0], id: "skillver_review", skillId: "skill_review" },
        files: skillDetailResponse.files,
      }, 201);
    }
    if (url.includes("/api/skills/skill_cost/publish") && method === "POST") {
      return jsonResponse({
        operation: {
          ...operationsResponse.operations[0],
          id: "op_publish_2",
          status: "queued",
          summary: "发布 Skill：Cost Review",
        },
      }, 202);
    }
    if (url.includes("/api/skills/skill_cost/versions") && method === "POST") {
      const nextDetail = {
        ...detailResponse,
        skill: {
          ...detailResponse.skill,
          description: "已更新的成本审查说明",
          status: "draft",
          updatedAt: "2026-05-14T09:30:00.000Z",
        },
        versions: [
          {
            ...detailResponse.versions[0],
            id: "skillver_cost_2",
            packageHash: "hash_2",
            publishedAt: null,
            version: "2",
          },
          ...detailResponse.versions,
        ],
        files: [
          {
            ...detailResponse.files[0],
            content: init?.body ? JSON.parse(init.body.toString()).source.content : "",
            contentHash: "hash_file_2",
            skillVersionId: "skillver_cost_2",
          },
        ],
      };
      return jsonResponse({
        files: nextDetail.files,
        skill: nextDetail.skill,
        version: nextDetail.versions[0],
      }, 201);
    }
    if (url.includes("/api/skills/skill_cost/archive") && method === "POST") {
      return jsonResponse({
        skill: {
          ...detailResponse.skill,
          archivedAt: "2026-05-14T09:40:00.000Z",
          status: "archived",
        },
      });
    }
    if (url.includes("/api/skills/skill_cost") && method === "DELETE") {
      return jsonResponse({ deletedSkillId: "skill_cost" });
    }
    if (url.includes("/api/skill-assignments/assignment_1/sync") && method === "POST") {
      return jsonResponse({
        operation: {
          ...operationsResponse.operations[0],
          id: "op_sync_1",
          status: "queued",
          summary: "同步 Skill：Cost Review",
          targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
          targetType: "agent",
          type: "skill_sync",
        },
      }, 202);
    }
    if (url.includes("/api/skill-assignments") && method === "POST") {
      return jsonResponse({
        operation: {
          ...operationsResponse.operations[0],
          id: "op_assign_1",
          type: "skill_assign",
          summary: "分配 Skill：Cost Review",
          targetType: "agent",
        targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      },
      }, 202);
    }
    if (url.includes("/api/approval-requests/approval_1/approve") && method === "POST") {
      return jsonResponse({
        approvalRequest: {
          ...pendingApprovalsResponse.approvalRequests[0],
          status: "approved",
        },
        operation: {
          ...operationsResponse.operations[0],
          id: "op_assign_approved",
          status: "queued",
          summary: "分配 Skill：Cost Review",
          type: "skill_assign",
        },
      });
    }
    if (url.includes("/api/approval-requests/approval_1/reject") && method === "POST") {
      return jsonResponse({
        approvalRequest: {
          ...pendingApprovalsResponse.approvalRequests[0],
          status: "rejected",
        },
      });
    }
    if (url.includes("/api/skills/skill_cost/versions/skillver_cost_1/files")) {
      return jsonResponse({ files: detailResponse.files });
    }
    if (url.includes("/api/skill-targets/agent/gezilinll-claw%3Aopenclaw%3Agateway-local%3Aagent%3Amain/skill-set")) {
      return jsonResponse(targetSkillSetResponse);
    }
    if (url.includes("/api/skills/skill_cost")) {
      return jsonResponse(detailResponse);
    }
    if (url.includes("/api/skills?")) return jsonResponse(skillListResponse);
    if (url.includes("/api/skill-discoveries")) return jsonResponse(skillDiscoveriesResponse);
    if (url.includes("/api/runtime-fleet")) return jsonResponse(runtimeFleetResponse);
    if (url.includes("/api/skill-assignments")) return jsonResponse(assignmentsResponse);
    if (url.includes("/api/approval-requests")) return jsonResponse(approvalsResponse);
    if (url.includes("/api/operations")) return jsonResponse(operationsResponse);
    if (url.includes("/api/notifications")) return jsonResponse(notificationsResponse);
    return jsonResponse({ error: "unexpected request" }, 500);
  }) as unknown as typeof fetch;
  return calls;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("SkillRegistryPage", () => {
  it("does not query Skill APIs before an organization is selected", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<SkillRegistryPage />);

    expect(screen.getByRole("heading", { name: "Skill 管理" })).toBeInTheDocument();
    expect(screen.getByText("请选择组织后管理 Skill。")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads Skill inventory, files, target options, operations, and notifications", async () => {
    installSkillRegistryFetchMock();

    render(<SkillRegistryPage organizationId="org_1" />);

    expect(await screen.findByRole("heading", { name: "Cost Review" })).toBeInTheDocument();
    expect(screen.getAllByText("检查成本与效率异常").length).toBeGreaterThan(0);
    expect(screen.getByText("SKILL.md")).toBeInTheDocument();
    expect(screen.getByText(/发布 Skill：Cost Review/)).toBeInTheDocument();
    expect(screen.getByText("Skill 发布已排队")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Agent · main" })).toBeInTheDocument();
  });

  it("imports Markdown Skills through the formal API", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock();
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.selectOptions(screen.getByLabelText("导入来源"), "markdown");
    await user.clear(screen.getByLabelText("文件名"));
    await user.type(screen.getByLabelText("文件名"), "SKILL.md");
    await user.type(screen.getByLabelText("Skill 内容"), "# Imported Skill\n用于验证导入。");
    await user.click(screen.getByRole("button", { name: "导入 Skill" }));

    await waitFor(() => expect(screen.getByText("Imported Skill 已导入。")).toBeInTheDocument());
    const importCall = calls.find((call) => call.url.includes("/api/skills/import") && call.method === "POST");
    expect(importCall?.body).toMatchObject({
      organizationId: "org_1",
      source: {
        content: "# Imported Skill\n用于验证导入。",
        filename: "SKILL.md",
        type: "markdown",
      },
    });
  });

  it("imports ZIP Skill packages as base64 instead of pretending they are Markdown", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock();
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.selectOptions(screen.getByLabelText("导入来源"), "zip");
    await user.upload(
      screen.getByLabelText("ZIP 包"),
      new File(["zip-bytes"], "cost-skill.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: "导入 Skill" }));

    await waitFor(() => expect(screen.getByText("Imported Skill 已导入。")).toBeInTheDocument());
    const importCall = calls.find((call) => call.url.includes("/api/skills/import") && call.method === "POST");
    expect(importCall?.body).toMatchObject({
      organizationId: "org_1",
      source: {
        contentBase64: "emlwLWJ5dGVz",
        filename: "cost-skill.zip",
        type: "zip",
      },
    });
  });

  it("shows device-discovered Skills and promotes them into organization storage", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock();
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    expect(screen.getByRole("heading", { name: "设备发现 Skill" })).toBeInTheDocument();
    expect(screen.getByText("Review Skill")).toBeInTheDocument();
    expect(screen.getByText("Agent · main · 2026/05/14 16:31")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "提升为组织 Skill" }));

    await waitFor(() => expect(screen.getByText("Review Skill 已提升为组织 Skill。")).toBeInTheDocument());
    expect(calls.find((call) => call.url.includes("/api/skill-discoveries/") && call.method === "POST")?.body).toEqual({
      organizationId: "org_1",
    });
  });

  it("queues publish and assignment operations instead of pretending synchronous writes", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock();
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.click(screen.getByRole("button", { name: "发布最新版本" }));
    await waitFor(() => expect(screen.getByText("发布任务已排队。")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("分配目标"), screen.getByRole("option", { name: "Agent · main" }));
    await user.click(screen.getByRole("button", { name: "分配 Skill" }));
    await waitFor(() => expect(screen.getByText("分配任务已排队。")).toBeInTheDocument());

    expect(calls.find((call) => call.url.includes("/api/skills/skill_cost/publish"))?.body).toMatchObject({
      versionId: "skillver_cost_1",
    });
    expect(calls.find((call) => call.url.includes("/api/skill-assignments") && call.method === "POST")?.body).toMatchObject({
      organizationId: "org_1",
      skillId: "skill_cost",
      skillVersionId: "skillver_cost_1",
      targetId: "gezilinll-claw:openclaw:gateway-local:agent:main",
      targetType: "agent",
    });
  });

  it("does not offer assignment before the selected Skill version is published", async () => {
    const user = userEvent.setup();
    const unpublishedDetail = {
      ...skillDetailResponse,
      skill: {
        ...skillDetailResponse.skill,
        status: "draft",
      },
      versions: [
        {
          ...skillDetailResponse.versions[0],
          publishedAt: null,
        },
      ],
    };
    installSkillRegistryFetchMock({ detail: unpublishedDetail });
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.selectOptions(screen.getByLabelText("分配目标"), screen.getByRole("option", { name: "Agent · main" }));

    expect(screen.getByRole("button", { name: "发布后可分配" })).toBeDisabled();
  });

  it("lets reviewers approve pending Skill governance requests from the detail panel", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock({ approvals: pendingApprovalsResponse });
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    expect(screen.getByText(/需要目标 owner 审批后才能分配到 main。/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "批准" }));

    await waitFor(() => expect(screen.getByText("审批已批准。")).toBeInTheDocument());
    expect(calls.find((call) => call.url.includes("/api/approval-requests/approval_1/approve"))).toMatchObject({
      body: { resolutionReason: "" },
      method: "POST",
    });
  });

  it("queues sync operations for approved Skill assignments", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock({ assignments: approvedAssignmentsResponse });
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.click(screen.getByRole("button", { name: "同步到目标" }));

    await waitFor(() => expect(screen.getByText("同步任务已排队。")).toBeInTheDocument());
    expect(calls.find((call) => call.url.includes("/api/skill-assignments/assignment_1/sync"))).toMatchObject({
      method: "POST",
    });
  });

  it("loads the resolved target Skill set after a target is selected", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock({ assignments: approvedAssignmentsResponse });
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.selectOptions(screen.getByLabelText("分配目标"), screen.getByRole("option", { name: "Agent · main" }));

    expect(await screen.findByText("目标 Skill Set")).toBeInTheDocument();
    expect(screen.getByText("Cost Review · 待同步")).toBeInTheDocument();
    expect(calls.some((call) => (
      call.url.includes("/api/skill-targets/agent/gezilinll-claw%3Aopenclaw%3Agateway-local%3Aagent%3Amain/skill-set")
      && call.url.includes("organizationId=org_1")
    ))).toBe(true);
  });

  it("edits the latest Skill markdown as a draft version with a preview", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock();
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.click(screen.getByRole("button", { name: "编辑源文" }));
    const editor = screen.getByLabelText("Skill 源文");
    await user.clear(editor);
    await user.type(editor, `---
name: Cost Review
description: 已更新的成本审查说明
license: MIT
compatibility: openclaw
---

# Cost Review

增加日报检查。`);
    await user.click(screen.getByRole("button", { name: "预览" }));

    const preview = screen.getByLabelText("Skill 预览");
    expect(within(preview).getByRole("heading", { name: "Cost Review" })).toBeInTheDocument();
    expect(within(preview).getByText("增加日报检查。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "源文" }));
    await user.click(screen.getByRole("button", { name: "保存草稿版本" }));

    await waitFor(() => expect(screen.getByText("草稿版本已保存。")).toBeInTheDocument());
    const draftCall = calls.find((call) => call.url.includes("/api/skills/skill_cost/versions") && call.method === "POST");
    expect(draftCall?.body).toMatchObject({
      source: {
        content: expect.stringContaining("增加日报检查。"),
        filename: "SKILL.md",
        type: "markdown",
      },
      summary: "Manual Skill edit",
    });
  });

  it("archives and removes Skills from the active registry list", async () => {
    const user = userEvent.setup();
    const calls = installSkillRegistryFetchMock();
    render(<SkillRegistryPage organizationId="org_1" />);

    await screen.findByRole("heading", { name: "Cost Review" });
    await user.click(screen.getByRole("button", { name: "归档 Skill" }));

    await waitFor(() => expect(screen.getByText("Skill 已归档。")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Cost Review/ })).not.toBeInTheDocument();
    expect(calls.find((call) => call.url.includes("/api/skills/skill_cost/archive"))).toMatchObject({
      method: "POST",
    });
  });
});
