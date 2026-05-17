import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PixelIcon } from "../ui/PixelIcon";

type SkillStatus = "draft" | "published" | "archived";
type ValidationStatus = "passed" | "warning" | "blocked";
type AssignmentTargetType = "device" | "runtime" | "agent";
type AssignmentStatus = "pending_review" | "approved" | "syncing" | "synced" | "failed" | "unsupported" | "disabled";
type TargetSkillResolutionState = "pending_sync" | "syncing" | "installed" | "failed" | "unsupported";
type OperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "unsupported"
  | "requires_manual_step"
  | "cancelled";

interface SkillSummary {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string;
  ownerUserId: string;
  status: SkillStatus;
  source: {
    type: string;
    filename?: string;
    url?: string;
  };
  createdAt: string;
  updatedAt: string;
  latestVersion?: string | null;
  latestValidationStatus?: ValidationStatus | null;
}

interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  packageHash: string;
  summary?: string | null;
  createdByUserId: string;
  publishedByUserId?: string | null;
  publishedAt?: string | null;
  validationStatus: ValidationStatus;
  validationResult: {
    status: ValidationStatus;
    findings?: Array<{ message?: string; path?: string; severity?: string }>;
  };
  createdAt: string;
}

interface SkillFile {
  id: string;
  skillVersionId: string;
  path: string;
  content?: string;
  contentHash: string;
  sizeBytes?: number;
  createdAt: string;
}

interface SkillDetailResponse {
  skill: SkillSummary;
  versions: SkillVersion[];
  files: SkillFile[];
}

interface SkillVersionDraftResponse {
  skill: SkillSummary;
  version: SkillVersion;
  files: SkillFile[];
}

interface SkillAssignment {
  id: string;
  skillId: string;
  skillVersionId: string;
  targetType: AssignmentTargetType;
  targetId: string;
  status: AssignmentStatus;
  updatedAt: string;
}

interface TargetSkillSetEntry extends SkillAssignment {
  overriddenAssignmentIds?: string[];
  resolutionState: TargetSkillResolutionState;
  specificity?: number;
}

interface TargetSkillSetResponse {
  target?: {
    id: string;
    name: string;
    type: AssignmentTargetType;
  };
  targetLineage?: Array<{
    targetId: string;
    targetType: AssignmentTargetType;
  }>;
  targetSkillSet?: TargetSkillSetEntry[];
}

interface ApprovalRequest {
  id: string;
  action: string;
  skillId?: string | null;
  targetType?: AssignmentTargetType | null;
  targetId?: string | null;
  riskLevel: string;
  riskSummary: string;
  status: string;
  createdAt: string;
}

interface Operation {
  id: string;
  type: string;
  status: OperationStatus;
  summary: string;
  resourceId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  updatedAt: string;
}

interface NotificationThread {
  id: string;
  severity: "info" | "warning" | "critical";
  status: string;
  title: string;
  latestSummary: string;
  occurrenceCount: number;
  lastOccurredAt: string;
}

interface RuntimeFleetResponse {
  devices?: Array<{ id: string; name: string }>;
  runtimes?: Array<{ id: string; name: string; deviceId: string; kind: string }>;
  agents?: Array<{ id: string; name: string; runtimeId: string; origin: string }>;
}

interface SkillDiscovery {
  id: string;
  deviceId: string;
  source: string;
  targetType: AssignmentTargetType;
  targetId: string;
  targetName?: string;
  runtimeId?: string;
  agentId?: string;
  name: string;
  description: string;
  packageHash: string;
  skillPath: string;
  lastSeenAt?: string;
}

interface SkillTargetOption {
  id: string;
  label: string;
  type: AssignmentTargetType;
}

const validationLabels: Record<ValidationStatus, string> = {
  blocked: "阻断",
  passed: "通过",
  warning: "警告",
};

const skillStatusLabels: Record<SkillStatus, string> = {
  archived: "已归档",
  draft: "草稿",
  published: "已发布",
};

const operationStatusLabels: Record<OperationStatus, string> = {
  cancelled: "已取消",
  failed: "失败",
  queued: "排队中",
  requires_manual_step: "需人工处理",
  running: "执行中",
  succeeded: "完成",
  unsupported: "不支持",
};

const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  approved: "待同步",
  disabled: "已停用",
  failed: "同步失败",
  pending_review: "待审批",
  synced: "已同步",
  syncing: "同步中",
  unsupported: "不支持",
};

const targetResolutionStateLabels: Record<TargetSkillResolutionState, string> = {
  failed: "同步失败",
  installed: "已安装",
  pending_sync: "待同步",
  syncing: "同步中",
  unsupported: "不支持",
};

/** Organization-scoped Skill management page backed by formal Skill, Operation, and Notification APIs. */
export function SkillRegistryPage({ organizationId }: { organizationId?: string }) {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [assignments, setAssignments] = useState<SkillAssignment[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [notifications, setNotifications] = useState<NotificationThread[]>([]);
  const [skillDiscoveries, setSkillDiscoveries] = useState<SkillDiscovery[]>([]);
  const [targets, setTargets] = useState<SkillTargetOption[]>([]);
  const [targetSkillSet, setTargetSkillSet] = useState<TargetSkillSetEntry[]>([]);
  const [targetSkillSetTarget, setTargetSkillSetTarget] = useState<TargetSkillSetResponse["target"] | null>(null);
  const [sourceType, setSourceType] = useState("markdown");
  const [sourceUrl, setSourceUrl] = useState("");
  const [filename, setFilename] = useState("SKILL.md");
  const [markdownContent, setMarkdownContent] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorMode, setEditorMode] = useState<"source" | "preview">("source");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [selectedTargetValue, setSelectedTargetValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTargetSkillSet, setIsLoadingTargetSkillSet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSkill = detail?.skill ?? skills.find((skill) => skill.id === selectedSkillId) ?? null;
  const latestVersion = detail?.versions[0] ?? null;
  const selectedAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.skillId === selectedSkillId),
    [assignments, selectedSkillId],
  );
  const selectedApprovals = useMemo(
    () => approvals.filter((approval) => !approval.skillId || approval.skillId === selectedSkillId),
    [approvals, selectedSkillId],
  );

  useEffect(() => {
    if (!organizationId) return;
    const scopedOrganizationId = organizationId;
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const [skillsPayload, assignmentsPayload, approvalsPayload, operationsPayload, notificationsPayload, runtimePayload, discoveriesPayload] =
          await Promise.all([
            fetchJson<{ skills?: SkillSummary[] }>(`/api/skills?organizationId=${encodeURIComponent(scopedOrganizationId)}`),
            fetchJson<{ assignments?: SkillAssignment[] }>(`/api/skill-assignments?organizationId=${encodeURIComponent(scopedOrganizationId)}`),
            fetchJson<{ approvalRequests?: ApprovalRequest[] }>(`/api/approval-requests?organizationId=${encodeURIComponent(scopedOrganizationId)}&status=pending`),
            fetchJson<{ operations?: Operation[] }>(`/api/operations?organizationId=${encodeURIComponent(scopedOrganizationId)}&resourceType=skill&limit=20`),
            fetchJson<{ threads?: NotificationThread[] }>(`/api/notifications?organizationId=${encodeURIComponent(scopedOrganizationId)}`),
            fetchJson<RuntimeFleetResponse>("/api/runtime-fleet"),
            fetchJson<{ skillDiscoveries?: SkillDiscovery[] }>(`/api/skill-discoveries?organizationId=${encodeURIComponent(scopedOrganizationId)}`),
          ]);
        if (cancelled) return;
        const nextSkills = skillsPayload.skills ?? [];
        setSkills(nextSkills);
        setAssignments(assignmentsPayload.assignments ?? []);
        setApprovals(approvalsPayload.approvalRequests ?? []);
        setOperations(operationsPayload.operations ?? []);
        setNotifications(notificationsPayload.threads ?? []);
        setSkillDiscoveries(discoveriesPayload.skillDiscoveries ?? []);
        setTargets(runtimeFleetTargets(runtimePayload));
        setSelectedSkillId((current) => current || nextSkills[0]?.id || "");
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "读取 Skill 数据失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetType = params.get("targetType");
    const targetId = params.get("targetId");
    if (!targetType || !targetId) return;
    if (targetType !== "agent" && targetType !== "runtime" && targetType !== "device") return;
    const nextValue = targetOptionValue({ id: targetId, type: targetType });
    if (targets.some((target) => targetOptionValue(target) === nextValue)) {
      setSelectedTargetValue((current) => current || nextValue);
    }
  }, [targets]);

  useEffect(() => {
    if (!selectedSkillId) {
      setDetail(null);
      setFiles([]);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      try {
        const { nextDetail, nextFiles } = await fetchSkillDetailWithFiles(selectedSkillId);
        if (cancelled) return;
        setDetail(nextDetail);
        setFiles(nextFiles);
        setEditorContent(readEditableSkillContent(nextFiles));
        setEditorMode("source");
        setIsEditorOpen(false);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "读取 Skill 详情失败");
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSkillId]);

  useEffect(() => {
    if (!organizationId || !selectedTargetValue) {
      setTargetSkillSet([]);
      setTargetSkillSetTarget(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const result = await loadTargetSkillSet(selectedTargetValue);
      if (cancelled) return;
      setTargetSkillSet(result?.targetSkillSet ?? []);
      setTargetSkillSetTarget(result?.target ?? null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedTargetValue]);

  async function loadTargetSkillSet(targetValue = selectedTargetValue): Promise<TargetSkillSetResponse | null> {
    if (!organizationId || !targetValue) return null;
    const selectedTarget = parseTargetOptionValue(targetValue);
    if (!selectedTarget) return null;
    setIsLoadingTargetSkillSet(true);
    try {
      return await fetchJson<TargetSkillSetResponse>(
        `/api/skill-targets/${selectedTarget.type}/${encodeURIComponent(selectedTarget.id)}/skill-set?organizationId=${encodeURIComponent(organizationId)}`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "读取目标 Skill Set 失败");
      return null;
    } finally {
      setIsLoadingTargetSkillSet(false);
    }
  }

  async function refreshActivity() {
    if (!organizationId) return;
    const [operationsPayload, notificationsPayload, assignmentsPayload, approvalsPayload, discoveriesPayload] = await Promise.all([
      fetchJson<{ operations?: Operation[] }>(`/api/operations?organizationId=${encodeURIComponent(organizationId)}&resourceType=skill&limit=20`),
      fetchJson<{ threads?: NotificationThread[] }>(`/api/notifications?organizationId=${encodeURIComponent(organizationId)}`),
      fetchJson<{ assignments?: SkillAssignment[] }>(`/api/skill-assignments?organizationId=${encodeURIComponent(organizationId)}`),
      fetchJson<{ approvalRequests?: ApprovalRequest[] }>(`/api/approval-requests?organizationId=${encodeURIComponent(organizationId)}&status=pending`),
      fetchJson<{ skillDiscoveries?: SkillDiscovery[] }>(`/api/skill-discoveries?organizationId=${encodeURIComponent(organizationId)}`),
    ]);
    setOperations(operationsPayload.operations ?? []);
    setNotifications(notificationsPayload.threads ?? []);
    setAssignments(assignmentsPayload.assignments ?? []);
    setApprovals(approvalsPayload.approvalRequests ?? []);
    setSkillDiscoveries(discoveriesPayload.skillDiscoveries ?? []);
    const nextTargetSkillSet = await loadTargetSkillSet();
    if (nextTargetSkillSet) {
      setTargetSkillSet(nextTargetSkillSet.targetSkillSet ?? []);
      setTargetSkillSetTarget(nextTargetSkillSet.target ?? null);
    }
  }

  async function handleSaveDraftVersion() {
    if (!selectedSkill) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const result = await fetchJson<SkillVersionDraftResponse>(
        `/api/skills/${encodeURIComponent(selectedSkill.id)}/versions`,
        {
          body: JSON.stringify({
            source: {
              content: editorContent,
              filename: "SKILL.md",
              type: "markdown",
            },
            summary: "Manual Skill edit",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setSkills((current) => current.map((skill) => (
        skill.id === result.skill.id
          ? {
              ...result.skill,
              latestValidationStatus: result.version.validationStatus,
              latestVersion: result.version.version,
            }
          : skill
      )));
      const { nextDetail, nextFiles } = await fetchSkillDetailWithFiles(result.skill.id);
      setDetail(nextDetail);
      setFiles(nextFiles);
      setEditorContent(readEditableSkillContent(nextFiles));
      setEditorMode("source");
      setIsEditorOpen(true);
      setStatusMessage("草稿版本已保存。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存草稿版本失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImport() {
    if (!organizationId) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const body = await createImportBody({
        filename,
        markdownContent,
        organizationId,
        sourceType,
        sourceUrl,
        zipFile,
      });
      const result = await fetchJson<{ skill?: SkillSummary }>("/api/skills/import", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (result.skill) {
        setSkills((current) => [result.skill as SkillSummary, ...current.filter((skill) => skill.id !== result.skill?.id)]);
        setSelectedSkillId(result.skill.id);
        setStatusMessage(`${result.skill.name} 已导入。`);
      } else {
        setStatusMessage("Skill 已导入。");
      }
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导入 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePromoteDiscovery(discovery: SkillDiscovery) {
    if (!organizationId) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const result = await fetchJson<{ skill?: SkillSummary }>(
        `/api/skill-discoveries/${encodeURIComponent(discovery.id)}/promote`,
        {
          body: JSON.stringify({ organizationId }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (result.skill) {
        setSkills((current) => [result.skill as SkillSummary, ...current.filter((skill) => skill.id !== result.skill?.id)]);
        setSelectedSkillId(result.skill.id);
        setStatusMessage(`${result.skill.name} 已提升为组织 Skill。`);
      } else {
        setStatusMessage("已提升为组织 Skill。");
      }
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "提升设备 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePublish() {
    if (!selectedSkill || !latestVersion) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const result = await fetchJson<{ approvalRequest?: ApprovalRequest; operation?: Operation }>(
        `/api/skills/${encodeURIComponent(selectedSkill.id)}/publish`,
        {
          body: JSON.stringify({ versionId: latestVersion.id }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setStatusMessage(result.operation ? "发布任务已排队。" : result.approvalRequest ? "发布申请已提交。" : "发布请求已提交。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "发布 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssign() {
    if (!organizationId || !selectedSkill || !latestVersion || !selectedTargetValue) return;
    const selectedTarget = parseTargetOptionValue(selectedTargetValue);
    if (!selectedTarget) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const result = await fetchJson<{ approvalRequest?: ApprovalRequest; operation?: Operation }>("/api/skill-assignments", {
        body: JSON.stringify({
          organizationId,
          skillId: selectedSkill.id,
          skillVersionId: latestVersion.id,
          targetId: selectedTarget.id,
          targetType: selectedTarget.type,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      setStatusMessage(result.operation ? "分配任务已排队。" : result.approvalRequest ? "分配申请已提交。" : "分配请求已提交。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "分配 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprovalDecision(approval: ApprovalRequest, decision: "approve" | "reject") {
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await fetchJson<{ approvalRequest?: ApprovalRequest; operation?: Operation }>(
        `/api/approval-requests/${encodeURIComponent(approval.id)}/${decision}`,
        {
          body: JSON.stringify({ resolutionReason: "" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setStatusMessage(decision === "approve" ? "审批已批准。" : "审批已拒绝。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "处理审批失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSyncAssignment(assignment: SkillAssignment) {
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await fetchJson<{ operation?: Operation }>(`/api/skill-assignments/${encodeURIComponent(assignment.id)}/sync`, {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      setStatusMessage("同步任务已排队。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "同步 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchiveSkill() {
    if (!selectedSkill) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await fetchJson<{ skill?: SkillSummary }>(`/api/skills/${encodeURIComponent(selectedSkill.id)}/archive`, {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const nextSkills = skills.filter((skill) => skill.id !== selectedSkill.id);
      setSkills(nextSkills);
      setSelectedSkillId(nextSkills[0]?.id ?? "");
      setDetail(null);
      setFiles([]);
      setTargetSkillSet([]);
      setStatusMessage("Skill 已归档。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "归档 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteDraftSkill() {
    if (!selectedSkill) return;
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await fetchJson<{ deletedSkillId?: string }>(`/api/skills/${encodeURIComponent(selectedSkill.id)}`, {
        method: "DELETE",
      });
      const nextSkills = skills.filter((skill) => skill.id !== selectedSkill.id);
      setSkills(nextSkills);
      setSelectedSkillId(nextSkills[0]?.id ?? "");
      setDetail(null);
      setFiles([]);
      setTargetSkillSet([]);
      setStatusMessage("草稿 Skill 已删除。");
      await refreshActivity();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除草稿 Skill 失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!organizationId) {
    return (
      <section className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Skill / Management</p>
            <h1>Skill 管理</h1>
            <p className="pageSubtitle">请选择组织后管理 Skill。</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Skill / Management</p>
          <h1>Skill 管理</h1>
          <p className="pageSubtitle">统一管理组织 Skill 资产、目标 Skill Set、设备发现、审批、同步任务和通知。</p>
        </div>
      </header>

      <section className="metricGrid" aria-label="Skill 概览">
        <Metric label="组织 Skill" value={skills.length} tone="blue" />
        <Metric label="已发布" value={skills.filter((skill) => skill.status === "published").length} tone="green" />
        <Metric label="待处理操作" value={operations.filter((operation) => operation.status === "queued" || operation.status === "running").length} tone="orange" />
        <Metric label="通知" value={notifications.length} tone="purple" />
      </section>

      <section className="skillRegistryGrid">
        <section className="tablePanel skillImportPanel" aria-label="Skill 导入">
          <div className="runtimePanelHeader">
            <div>
              <h2>导入 Skill</h2>
              <p>支持 Markdown、ZIP、GitHub URL 和 Marketplace URL 导入。</p>
            </div>
          </div>
          <div className="skillForm">
            <label className="toolbarField">
              <span className="controlLabel">导入来源</span>
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                <option value="markdown">Markdown</option>
                <option value="zip">ZIP 包</option>
                <option value="github_url">GitHub URL</option>
                <option value="marketplace_url">Marketplace URL</option>
              </select>
            </label>
            {sourceType === "markdown" ? (
              <>
                <label className="toolbarField">
                  <span className="controlLabel">文件名</span>
                  <input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="SKILL.md" />
                </label>
                <label className="toolbarField">
                  <span className="controlLabel">Skill 内容</span>
                  <textarea value={markdownContent} onChange={(event) => setMarkdownContent(event.target.value)} placeholder="# Skill name" />
                </label>
              </>
            ) : sourceType === "zip" ? (
              <label className="toolbarField">
                <span className="controlLabel">ZIP 包</span>
                <input
                  accept=".zip,application/zip"
                  type="file"
                  onChange={(event) => setZipFile(event.currentTarget.files?.[0] ?? null)}
                />
                {zipFile ? <small className="mutedText">{zipFile.name}</small> : null}
              </label>
            ) : (
              <label className="toolbarField">
                <span className="controlLabel">来源 URL</span>
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://github.com/org/repo/tree/main/skill" />
              </label>
            )}
            <button className="primaryButton" type="button" disabled={isSubmitting} onClick={() => void handleImport()}>
              <PixelIcon name="paper-plane" size={16} />
              导入 Skill
            </button>
            {statusMessage ? <p className="skillStatusMessage">{statusMessage}</p> : null}
            {errorMessage ? <p className="skillErrorMessage">{errorMessage}</p> : null}
          </div>
        </section>

        <section className="tablePanel skillDiscoveryPanel" aria-label="设备发现 Skill">
          <div className="runtimePanelHeader">
            <div>
              <h2>设备发现 Skill</h2>
              <p>{skillDiscoveries.length} 个本地 Skill 可提升</p>
            </div>
          </div>
          <div className="skillActivityList">
            {skillDiscoveries.length === 0 ? (
              <p className="emptyAsset">暂无设备发现 Skill。</p>
            ) : (
              skillDiscoveries.map((discovery) => (
                <article className="skillActivityItem" key={discovery.id}>
                  <strong>{discovery.name}</strong>
                  <span>{discovery.description || "暂无描述"}</span>
                  <small>
                    {targetLabel(discovery.targetType)}
                    {discovery.targetName ? ` · ${discovery.targetName}` : ""}
                    {discovery.lastSeenAt ? ` · ${formatDateTime(discovery.lastSeenAt)}` : ""}
                  </small>
                  <button
                    className="secondaryButton"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => void handlePromoteDiscovery(discovery)}
                  >
                    提升为组织 Skill
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="tablePanel skillListPanel" aria-label="组织 Skill">
          <div className="runtimePanelHeader">
            <div>
              <h2>组织 Skill</h2>
              <p>{isLoading ? "读取中" : `${skills.length} 个 Skill`}</p>
            </div>
          </div>
          <div className="skillList">
            {skills.length === 0 ? (
              <p className="emptyAsset">暂无 Skill。</p>
            ) : (
              skills.map((skill) => (
                <button
                  className={skill.id === selectedSkillId ? "skillListItem skillListItemActive" : "skillListItem"}
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                >
                  <strong>{skill.name}</strong>
                  <span>{skill.description || "暂无描述"}</span>
                  <span className="channelList">
                    <span className={`statusBadge status-${skill.latestValidationStatus ?? "unknown"}`}>
                      {validationLabel(skill.latestValidationStatus)}
                    </span>
                    <span className="badge">{skillStatusLabels[skill.status]}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="tablePanel skillActivityPanel" aria-label="Skill 通知">
          <div className="runtimePanelHeader">
            <div>
              <h2>通知</h2>
              <p>{notifications.length} 条最近通知</p>
            </div>
          </div>
          <div className="skillActivityList">
            {notifications.length === 0 ? (
              <p className="emptyAsset">暂无通知。</p>
            ) : (
              notifications.map((thread) => (
                <article className="skillActivityItem" key={thread.id}>
                  <strong>{thread.title}</strong>
                  <span>{thread.latestSummary}</span>
                  <small>{formatDateTime(thread.lastOccurredAt)}</small>
                </article>
              ))
            )}
          </div>
        </section>

        <SkillDetailPanel
          assignments={selectedAssignments}
          approvals={selectedApprovals}
          detail={detail}
          editorContent={editorContent}
          editorMode={editorMode}
          files={files}
          isEditorOpen={isEditorOpen}
          isLoadingTargetSkillSet={isLoadingTargetSkillSet}
          latestVersion={latestVersion}
          operations={operations}
          selectedTargetValue={selectedTargetValue}
          skills={skills}
          targetSkillSet={targetSkillSet}
          targetSkillSetTarget={targetSkillSetTarget}
          targets={targets}
          onAssign={() => void handleAssign()}
          onArchive={() => void handleArchiveSkill()}
          onApprovalDecision={(approval, decision) => void handleApprovalDecision(approval, decision)}
          onDeleteDraft={() => void handleDeleteDraftSkill()}
          onEditorChange={setEditorContent}
          onEditorModeChange={setEditorMode}
          onPublish={() => void handlePublish()}
          onSaveDraftVersion={() => void handleSaveDraftVersion()}
          onSyncAssignment={(assignment) => void handleSyncAssignment(assignment)}
          onTargetChange={setSelectedTargetValue}
          onToggleEditor={() => setIsEditorOpen((current) => !current)}
          isSubmitting={isSubmitting}
        />
      </section>
    </section>
  );
}

function SkillDetailPanel({
  assignments,
  approvals,
  detail,
  editorContent,
  editorMode,
  files,
  isEditorOpen,
  isLoadingTargetSkillSet,
  isSubmitting,
  latestVersion,
  onAssign,
  onArchive,
  onApprovalDecision,
  onDeleteDraft,
  onEditorChange,
  onEditorModeChange,
  onPublish,
  onSaveDraftVersion,
  onSyncAssignment,
  onTargetChange,
  onToggleEditor,
  operations,
  selectedTargetValue,
  skills,
  targetSkillSet,
  targetSkillSetTarget,
  targets,
}: {
  assignments: SkillAssignment[];
  approvals: ApprovalRequest[];
  detail: SkillDetailResponse | null;
  editorContent: string;
  editorMode: "source" | "preview";
  files: SkillFile[];
  isEditorOpen: boolean;
  isLoadingTargetSkillSet: boolean;
  isSubmitting: boolean;
  latestVersion: SkillVersion | null;
  operations: Operation[];
  selectedTargetValue: string;
  skills: SkillSummary[];
  targetSkillSet: TargetSkillSetEntry[];
  targetSkillSetTarget: TargetSkillSetResponse["target"] | null;
  targets: SkillTargetOption[];
  onAssign: () => void;
  onArchive: () => void;
  onApprovalDecision: (approval: ApprovalRequest, decision: "approve" | "reject") => void;
  onDeleteDraft: () => void;
  onEditorChange: (value: string) => void;
  onEditorModeChange: (mode: "source" | "preview") => void;
  onPublish: () => void;
  onSaveDraftVersion: () => void;
  onSyncAssignment: (assignment: SkillAssignment) => void;
  onTargetChange: (value: string) => void;
  onToggleEditor: () => void;
}) {
  if (!detail) {
    return (
      <aside className="detailPanel skillDetailPanel" aria-label="Skill 详情">
        <h2>Skill 详情</h2>
        <p>选择一个 Skill 查看版本、文件、权限动作和同步状态。</p>
      </aside>
    );
  }

  const scopedOperations = operations.filter((operation) => operation.resourceId === detail.skill.id);
  const latestVersionIsPublished = Boolean(latestVersion?.publishedAt);
  const skillNameById = new Map(skills.map((skill) => [skill.id, skill.name]));
  const canEditSource = files.length === 1 && files[0]?.path === "SKILL.md";

  return (
    <aside className="detailPanel skillDetailPanel" aria-label="Skill 详情">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">Skill</p>
          <h2>{detail.skill.name}</h2>
          <p>{detail.skill.description || "暂无描述"}</p>
        </div>
        <span className={`statusBadge status-${latestVersion?.validationStatus ?? "unknown"}`}>
          {latestVersion ? validationLabels[latestVersion.validationStatus] : "未知"}
        </span>
      </div>

      <div className="detailBlock">
        <h3>版本</h3>
        <ul>
          {detail.versions.map((version) => (
            <li key={version.id}>
              v{version.version} · {version.publishedAt ? "已发布" : "未发布"} · {formatDateTime(version.createdAt)}
            </li>
          ))}
        </ul>
        <button className="primaryButton" type="button" disabled={!latestVersion || isSubmitting} onClick={onPublish}>
          发布最新版本
        </button>
      </div>

      <div className="detailBlock">
        <h3>文件</h3>
        <ul>
          {files.map((file) => (
            <li key={file.id}>{file.path}</li>
          ))}
        </ul>
        <button className="secondaryButton compactButton" type="button" disabled={!canEditSource} onClick={onToggleEditor}>
          编辑源文
        </button>
        {!canEditSource && files.length > 0 ? (
          <p className="mutedText">多文件 Skill 请通过重新导入更新，避免页面源文编辑丢失配套文件。</p>
        ) : null}
        {isEditorOpen ? (
          <div className="skillEditor">
            <div className="skillEditorToolbar" role="group" aria-label="Skill 编辑模式">
              <button
                className={editorMode === "source" ? "secondaryButton compactButton activeToggle" : "secondaryButton compactButton"}
                type="button"
                onClick={() => onEditorModeChange("source")}
              >
                源文
              </button>
              <button
                className={editorMode === "preview" ? "secondaryButton compactButton activeToggle" : "secondaryButton compactButton"}
                type="button"
                onClick={() => onEditorModeChange("preview")}
              >
                预览
              </button>
              <button className="primaryButton compactButton" type="button" disabled={isSubmitting} onClick={onSaveDraftVersion}>
                保存草稿版本
              </button>
            </div>
            {editorMode === "source" ? (
              <label className="toolbarField skillEditorSource">
                <span className="controlLabel">Skill 源文</span>
                <textarea
                  aria-label="Skill 源文"
                  value={editorContent}
                  onChange={(event) => onEditorChange(event.target.value)}
                />
              </label>
            ) : (
              <div className="skillEditorPreview" aria-label="Skill 预览">
                {renderSkillMarkdownPreview(editorContent)}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="detailBlock">
        <h3>分配</h3>
        <label className="toolbarField">
          <span className="controlLabel">分配目标</span>
          <select value={selectedTargetValue} onChange={(event) => onTargetChange(event.target.value)}>
            <option value="">选择目标</option>
            {targets.map((target) => (
              <option key={`${target.type}:${target.id}`} value={targetOptionValue(target)}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primaryButton"
          type="button"
          disabled={!selectedTargetValue || !latestVersion || !latestVersionIsPublished || isSubmitting}
          onClick={onAssign}
        >
          {latestVersionIsPublished ? "分配 Skill" : "发布后可分配"}
        </button>
        {assignments.length > 0 ? (
          <ul>
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <span>
                  {targetLabel(assignment.targetType)} · {assignment.targetId} ·{" "}
                  {assignmentStatusLabels[assignment.status] ?? assignment.status}
                </span>
                <span className="skillInlineActions">
                  <button
                    className="secondaryButton compactButton"
                    disabled={!canSyncAssignment(assignment.status) || isSubmitting}
                    type="button"
                    onClick={() => onSyncAssignment(assignment)}
                  >
                    同步到目标
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {selectedTargetValue ? (
          <div className="skillTargetSet">
            <h4>目标 Skill Set</h4>
            {targetSkillSetTarget ? (
              <p className="mutedText">
                {targetLabel(targetSkillSetTarget.type)} · {targetSkillSetTarget.name}
              </p>
            ) : null}
            {isLoadingTargetSkillSet ? (
              <p className="mutedText">读取中。</p>
            ) : targetSkillSet.length === 0 ? (
              <p className="mutedText">当前目标暂无显式生效 Skill。</p>
            ) : (
              <ul>
                {targetSkillSet.map((entry) => (
                  <li key={entry.id}>
                    {skillNameById.get(entry.skillId) ?? entry.skillId} ·{" "}
                    {targetResolutionStateLabels[entry.resolutionState] ?? entry.resolutionState}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="detailBlock">
        <h3>操作</h3>
        {scopedOperations.length === 0 ? (
          <p className="mutedText">暂无操作。</p>
        ) : (
          <ul>
            {scopedOperations.map((operation) => (
              <li key={operation.id}>
                {operation.summary} · {operationStatusLabels[operation.status] ?? operation.status}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="detailBlock">
        <h3>审批</h3>
        {approvals.length === 0 ? (
          <p className="mutedText">暂无待处理审批。</p>
        ) : (
          <ul>
            {approvals.map((approval) => (
              <li key={approval.id}>
                <span>{approvalActionLabel(approval.action)} · {approval.riskLevel} · {approval.riskSummary}</span>
                {approval.status === "pending" ? (
                  <span className="skillInlineActions">
                    <button
                      className="secondaryButton compactButton"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() => onApprovalDecision(approval, "approve")}
                    >
                      批准
                    </button>
                    <button
                      className="secondaryButton compactButton"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() => onApprovalDecision(approval, "reject")}
                    >
                      拒绝
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="detailBlock">
        <h3>归档与删除</h3>
        <p className="mutedText">归档会保留版本、文件、分配和审计历史；物理删除只允许未发布且未被引用的草稿。</p>
        <div className="skillInlineActions">
          <button className="secondaryButton compactButton dangerButton" disabled={isSubmitting} type="button" onClick={onArchive}>
            归档 Skill
          </button>
          {detail.skill.status === "draft" ? (
            <button className="secondaryButton compactButton dangerButton" disabled={isSubmitting} type="button" onClick={onDeleteDraft}>
              删除草稿
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`metricCard metric${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function fetchSkillDetailWithFiles(skillId: string): Promise<{
  nextDetail: SkillDetailResponse;
  nextFiles: SkillFile[];
}> {
  const nextDetail = await fetchJson<SkillDetailResponse>(`/api/skills/${encodeURIComponent(skillId)}`);
  const nextVersion = nextDetail.versions[0];
  const nextFiles = nextVersion
    ? (await fetchJson<{ files?: SkillFile[] }>(
        `/api/skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(nextVersion.id)}/files`,
      )).files ?? nextDetail.files ?? []
    : [];
  return { nextDetail, nextFiles };
}

function readEditableSkillContent(files: SkillFile[]): string {
  return files.find((file) => file.path === "SKILL.md")?.content ?? files[0]?.content ?? "";
}

function renderSkillMarkdownPreview(content: string) {
  const lines = stripFrontmatter(content).split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];

  function flushParagraph(key: string) {
    if (paragraph.length === 0) return;
    nodes.push(<p key={key}>{paragraph.join(" ")}</p>);
    paragraph = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      flushParagraph(`p-${index}`);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(`p-${index}`);
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) nodes.push(<h1 key={`h-${index}`}>{text}</h1>);
      else if (level === 2) nodes.push(<h2 key={`h-${index}`}>{text}</h2>);
      else nodes.push(<h3 key={`h-${index}`}>{text}</h3>);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph(`p-${index}`);
      nodes.push(<p className="skillPreviewBullet" key={`b-${index}`}>{bullet[1]}</p>);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph("p-end");

  return nodes.length > 0 ? nodes : <p className="mutedText">暂无可预览内容。</p>;
}

function stripFrontmatter(content: string): string {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return content;
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) return content;
  return lines.slice(endIndex + 1).join("\n");
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

async function createImportBody(input: {
  filename: string;
  markdownContent: string;
  organizationId: string;
  sourceType: string;
  sourceUrl: string;
  zipFile: File | null;
}) {
  if (input.sourceType === "github_url" || input.sourceType === "marketplace_url") {
    return {
      organizationId: input.organizationId,
      source: {
        type: input.sourceType,
        url: input.sourceUrl,
      },
    };
  }
  if (input.sourceType === "zip") {
    if (!input.zipFile) throw new Error("请选择 ZIP 包");
    return {
      organizationId: input.organizationId,
      source: {
        contentBase64: await fileToBase64(input.zipFile),
        filename: input.zipFile.name,
        type: "zip",
      },
    };
  }
  return {
    organizationId: input.organizationId,
    source: {
      content: input.markdownContent,
      filename: input.filename,
      type: "markdown",
    },
  };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function runtimeFleetTargets(payload: RuntimeFleetResponse): SkillTargetOption[] {
  const devices = (payload.devices ?? []).map((device) => ({
    id: device.id,
    label: `Device · ${device.name}`,
    type: "device" as const,
  }));
  const runtimes = (payload.runtimes ?? []).map((runtime) => ({
    id: runtime.id,
    label: `Runtime · ${runtime.name}`,
    type: "runtime" as const,
  }));
  const agents = (payload.agents ?? []).map((agent) => ({
    id: agent.id,
    label: `Agent · ${agent.name}`,
    type: "agent" as const,
  }));
  return [...agents, ...runtimes, ...devices];
}

function targetOptionValue(target: Pick<SkillTargetOption, "id" | "type">): string {
  return `${target.type}:${encodeURIComponent(target.id)}`;
}

function parseTargetOptionValue(value: string): SkillTargetOption | null {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 0) return null;
  const type = value.slice(0, separatorIndex);
  if (type !== "agent" && type !== "runtime" && type !== "device") return null;
  return {
    id: decodeURIComponent(value.slice(separatorIndex + 1)),
    label: "",
    type,
  };
}

function validationLabel(status?: ValidationStatus | null): string {
  return status ? validationLabels[status] : "未知";
}

function targetLabel(targetType: AssignmentTargetType): string {
  if (targetType === "agent") return "Agent";
  if (targetType === "runtime") return "Runtime";
  return "Device";
}

function canSyncAssignment(status: AssignmentStatus): boolean {
  return status === "approved" || status === "synced" || status === "failed" || status === "unsupported";
}

function approvalActionLabel(action: string): string {
  if (action === "publish_skill") return "发布 Skill";
  if (action === "assign_skill") return "分配 Skill";
  if (action === "archive_skill") return "归档 Skill";
  if (action === "delete_skill") return "删除 Skill";
  if (action === "manage_permissions") return "管理权限";
  return action;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
