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
const emptyAssignmentsResponse = { assignments: [] };
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
  detail?: typeof skillDetailResponse;
} = {}) {
  const detailResponse = options.detail ?? skillDetailResponse;
  const approvalsResponse = options.approvals ?? emptyApprovalsResponse;
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
    if (url.includes("/api/skills/skill_cost")) {
      return jsonResponse(detailResponse);
    }
    if (url.includes("/api/skills?")) return jsonResponse(skillListResponse);
    if (url.includes("/api/runtime-fleet")) return jsonResponse(runtimeFleetResponse);
    if (url.includes("/api/skill-assignments")) return jsonResponse(emptyAssignmentsResponse);
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

    expect(screen.getByRole("heading", { name: "Skill Registry" })).toBeInTheDocument();
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
});
