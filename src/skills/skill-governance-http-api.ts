import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthMemberRole, AuthSessionContext } from "../auth/auth-store";
import type { OperationRow, OperationStore } from "../operations/operation-store";
import type {
  ApprovalRequestRow,
  ApprovalStatus,
  GovernancePermission,
  GovernanceResourceType,
  SkillAssignmentTargetType,
  SkillGovernanceStore,
} from "./skill-governance-store";
import type { SkillStore, SkillVersionRow } from "./skill-store";

const maxJsonBodyChars = 1_000_000;

/** Auth guard required by Skill governance HTTP APIs. */
export interface SkillGovernanceHttpAuth {
  /** Return the signed-in user session, or `null` when unauthorized. */
  requireUserSession: (request: IncomingMessage) => Promise<AuthSessionContext | null>;
}

/** Dependencies for the Skill governance HTTP API. */
export interface SkillGovernanceHttpApiHandlerOptions {
  /** User-session auth guard. */
  requireUserSession: SkillGovernanceHttpAuth["requireUserSession"];
  /** Skill governance repository. */
  governanceStore: SkillGovernanceStore;
  /** Operation repository used for asynchronous Skill effects. */
  operationStore?: OperationStore;
  /** Skill content repository. */
  skillStore: SkillStore;
}

/** Skill governance API middleware compatible with other backend API handlers. */
export type SkillGovernanceHttpApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;

/** Create Skill permission, approval, publish, and assignment routes. */
export function createSkillGovernanceHttpApiHandler(
  options: SkillGovernanceHttpApiHandlerOptions,
): SkillGovernanceHttpApiHandler {
  return async function skillGovernanceHttpApiHandler(request, response, next) {
    const requestUrl = new URL(request.url || "/", "http://lorume.local");

    if (request.method === "POST" && requestUrl.pathname === "/api/resource-permissions") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const body = await readJsonBody(request);
      const organizationId = readString(body, "organizationId");
      const membership = readMembership(session, organizationId);
      if (!membership) {
        sendJson(response, organizationId ? 403 : 400, { error: organizationId ? "forbidden" : "organization_id_required" });
        return;
      }
      const resourceType = normalizeResourceType(readString(body, "resourceType"));
      const permission = normalizePermission(readString(body, "permission"));
      const resourceId = readString(body, "resourceId");
      const subjectUserId = readString(body, "subjectUserId");
      if (!resourceType || !permission || !resourceId || !subjectUserId) {
        sendJson(response, 400, { error: "resource_permission_input_required" });
        return;
      }
      if (!(await canManageResourceAccess(options, session, membership.role, {
        organizationId,
        resourceId,
        resourceType,
      }))) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const resourcePermission = await options.governanceStore.grantResourcePermission({
        grantedByUserId: session.user.id,
        organizationId,
        permission,
        resourceId,
        resourceType,
        subjectUserId,
      });
      sendJson(response, 201, { resourcePermission });
      return;
    }

    const publishMatch = requestUrl.pathname.match(/^\/api\/skills\/([^/]+)\/publish$/);
    if (request.method === "POST" && publishMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const body = await readJsonBody(request);
      const skillId = decodeURIComponent(publishMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const membership = readMembership(session, detail.skill.organizationId);
      if (!membership) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const version = selectSkillVersion(detail.versions, readString(body, "versionId"));
      if (!version) {
        sendJson(response, 404, { error: "skill_version_not_found" });
        return;
      }
      const canPublish = await options.governanceStore.hasResourcePermission({
        organizationId: detail.skill.organizationId,
        organizationRole: membership.role,
        permission: "publish",
        resourceId: detail.skill.id,
        resourceType: "skill",
        userId: session.user.id,
      });
      if (!canPublish) {
        const approvalRequest = await options.governanceStore.createApprovalRequest({
          action: "publish_skill",
          organizationId: detail.skill.organizationId,
          requestedByUserId: session.user.id,
          requestedReason: readString(body, "requestedReason") || null,
          riskLevel: version.validationStatus === "warning" ? "medium" : "low",
          riskSummary: version.validationStatus === "warning"
            ? "Skill version has validation warnings and needs publication review."
            : "Requester does not have Skill publish permission.",
          skillId: detail.skill.id,
          skillVersionId: version.id,
        });
        sendJson(response, 202, { approvalRequest });
        return;
      }
      const operationStore = requireOperationStore(response, options);
      if (!operationStore) return;
      const operation = await createSkillPublishOperation(operationStore, {
        organizationId: detail.skill.organizationId,
        publishedByUserId: session.user.id,
        requestedByUserId: session.user.id,
        skillId: detail.skill.id,
        skillName: detail.skill.name,
        skillVersionId: version.id,
      });
      sendJson(response, 202, { operation });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/approval-requests") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
      const membership = readMembership(session, organizationId);
      if (!membership) {
        sendJson(response, organizationId ? 403 : 400, { error: organizationId ? "forbidden" : "organization_id_required" });
        return;
      }
      const status = normalizeApprovalStatus(requestUrl.searchParams.get("status") ?? "");
      const approvalRequests = await options.governanceStore.listApprovalRequests({
        organizationId,
        status: status ?? undefined,
      });
      sendJson(response, 200, { approvalRequests });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/skill-assignments") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
      const membership = readMembership(session, organizationId);
      if (!membership) {
        sendJson(response, organizationId ? 403 : 400, { error: organizationId ? "forbidden" : "organization_id_required" });
        return;
      }
      const assignments = await options.governanceStore.listSkillAssignments({ organizationId });
      sendJson(response, 200, { assignments });
      return;
    }

    const approveMatch = requestUrl.pathname.match(/^\/api\/approval-requests\/([^/]+)\/(approve|reject)$/);
    if (request.method === "POST" && approveMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const requestId = decodeURIComponent(approveMatch[1] ?? "");
      const action = approveMatch[2] === "approve" ? "approved" : "rejected";
      const pending = await findPendingApproval(options, requestId, session);
      if (pending === "forbidden") {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      if (!pending) {
        sendJson(response, 404, { error: "approval_request_not_found" });
        return;
      }
      const operationStore = action === "approved" && approvalNeedsOperation(pending)
        ? requireOperationStore(response, options)
        : null;
      if (action === "approved" && approvalNeedsOperation(pending) && !operationStore) return;
      const body = await readJsonBody(request);
      const approvalRequest = await options.governanceStore.resolveApprovalRequest({
        requestId,
        resolution: action,
        resolutionReason: readString(body, "resolutionReason") || null,
        resolvedByUserId: session.user.id,
      });
      if (action !== "approved" || !approvalRequest || !operationStore || !approvalNeedsOperation(pending)) {
        sendJson(response, 200, { approvalRequest });
        return;
      }
      const operation = await createOperationForApprovedRequest(operationStore, pending, session.user.id);
      sendJson(response, 200, { approvalRequest, operation });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/skill-assignments") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const body = await readJsonBody(request);
      const organizationId = readString(body, "organizationId");
      const membership = readMembership(session, organizationId);
      if (!membership) {
        sendJson(response, organizationId ? 403 : 400, { error: organizationId ? "forbidden" : "organization_id_required" });
        return;
      }
      const skillId = readString(body, "skillId");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail || detail.skill.organizationId !== organizationId) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const version = selectSkillVersion(detail.versions, readString(body, "skillVersionId"));
      if (!version) {
        sendJson(response, 404, { error: "skill_version_not_found" });
        return;
      }
      if (!version.publishedAt) {
        sendJson(response, 409, { error: "skill_version_not_published" });
        return;
      }
      const targetType = normalizeTargetType(readString(body, "targetType"));
      const targetId = readString(body, "targetId");
      if (!targetType || !targetId) {
        sendJson(response, 400, { error: "skill_assignment_target_required" });
        return;
      }
      const canViewSkill = await options.governanceStore.hasResourcePermission({
        organizationId,
        organizationRole: membership.role,
        permission: "view",
        resourceId: skillId,
        resourceType: "skill",
        userId: session.user.id,
      });
      if (!canViewSkill) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const canManageTarget = await options.governanceStore.hasResourcePermission({
        organizationId,
        organizationRole: membership.role,
        permission: "manage_skills",
        resourceId: targetId,
        resourceType: targetType,
        userId: session.user.id,
      });
      if (!canManageTarget) {
        const approvalRequest = await options.governanceStore.createApprovalRequest({
          action: "assign_skill",
          organizationId,
          requestedByUserId: session.user.id,
          requestedReason: readString(body, "requestedReason") || null,
          riskLevel: "low",
          riskSummary: "Requester does not have target manage_skills permission.",
          skillId,
          skillVersionId: version.id,
          targetId,
          targetType,
        });
        sendJson(response, 202, { approvalRequest });
        return;
      }
      const operationStore = requireOperationStore(response, options);
      if (!operationStore) return;
      const operation = await createSkillAssignOperation(operationStore, {
        approvedByUserId: session.user.id,
        createdByUserId: session.user.id,
        organizationId,
        skillId,
        skillName: detail.skill.name,
        skillVersionId: version.id,
        targetId,
        targetType,
      });
      sendJson(response, 202, { operation });
      return;
    }

    next();
  };
}

async function createOperationForApprovedRequest(
  operationStore: OperationStore,
  request: ApprovalRequestRow,
  resolvedByUserId: string,
): Promise<OperationRow> {
  if (request.action === "publish_skill" && request.skillId && request.skillVersionId) {
    return createSkillPublishOperation(operationStore, {
      organizationId: request.organizationId,
      publishedByUserId: resolvedByUserId,
      requestedByUserId: request.requestedByUserId,
      skillId: request.skillId,
      skillName: "Skill",
      skillVersionId: request.skillVersionId,
    });
  }
  if (request.action === "assign_skill" && request.skillId && request.skillVersionId && request.targetId && request.targetType) {
    return createSkillAssignOperation(operationStore, {
      approvedByUserId: resolvedByUserId,
      createdByUserId: request.requestedByUserId,
      organizationId: request.organizationId,
      skillId: request.skillId,
      skillName: "Skill",
      skillVersionId: request.skillVersionId,
      targetId: request.targetId,
      targetType: request.targetType,
    });
  }
  throw new Error("approved approval request does not contain executable Skill operation payload");
}

async function createSkillPublishOperation(
  operationStore: OperationStore,
  input: {
    organizationId: string;
    publishedByUserId: string;
    requestedByUserId: string;
    skillId: string;
    skillName: string;
    skillVersionId: string;
  },
): Promise<OperationRow> {
  const operation = await operationStore.createOperation({
    metadata: {
      skillId: input.skillId,
      skillVersionId: input.skillVersionId,
    },
    organizationId: input.organizationId,
    requestedByUserId: input.requestedByUserId,
    resourceId: input.skillId,
    resourceType: "skill",
    summary: `发布 Skill：${input.skillName}`,
    type: "skill_publish",
  });
  await operationStore.enqueueJob({
    operationId: operation.id,
    organizationId: input.organizationId,
    payload: {
      publishedByUserId: input.publishedByUserId,
      skillId: input.skillId,
      skillVersionId: input.skillVersionId,
    },
    type: "skill_publish",
  });
  return operation;
}

async function createSkillAssignOperation(
  operationStore: OperationStore,
  input: {
    approvedByUserId: string;
    createdByUserId: string;
    organizationId: string;
    skillId: string;
    skillName: string;
    skillVersionId: string;
    targetId: string;
    targetType: SkillAssignmentTargetType;
  },
): Promise<OperationRow> {
  const operation = await operationStore.createOperation({
    metadata: {
      skillId: input.skillId,
      skillVersionId: input.skillVersionId,
      targetId: input.targetId,
      targetType: input.targetType,
    },
    organizationId: input.organizationId,
    requestedByUserId: input.createdByUserId,
    resourceId: input.skillId,
    resourceType: "skill",
    summary: `分配 Skill：${input.skillName}`,
    targetId: input.targetId,
    targetType: input.targetType,
    type: "skill_assign",
  });
  await operationStore.enqueueJob({
    operationId: operation.id,
    organizationId: input.organizationId,
    payload: {
      approvedByUserId: input.approvedByUserId,
      createdByUserId: input.createdByUserId,
      organizationId: input.organizationId,
      skillId: input.skillId,
      skillVersionId: input.skillVersionId,
      targetId: input.targetId,
      targetType: input.targetType,
    },
    type: "skill_assign",
  });
  return operation;
}

function approvalNeedsOperation(request: ApprovalRequestRow): boolean {
  return request.action === "publish_skill" || request.action === "assign_skill";
}

function requireOperationStore(
  response: ServerResponse,
  options: SkillGovernanceHttpApiHandlerOptions,
): OperationStore | null {
  if (options.operationStore) return options.operationStore;
  sendJson(response, 503, { error: "operation_store_unavailable" });
  return null;
}

async function canManageResourceAccess(
  options: SkillGovernanceHttpApiHandlerOptions,
  session: AuthSessionContext,
  organizationRole: AuthMemberRole,
  resource: { organizationId: string; resourceId: string; resourceType: GovernanceResourceType },
): Promise<boolean> {
  if (organizationRole === "owner" || organizationRole === "admin") return true;
  return options.governanceStore.hasResourcePermission({
    organizationId: resource.organizationId,
    organizationRole,
    permission: "manage_access",
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    userId: session.user.id,
  });
}

async function findPendingApproval(
  options: SkillGovernanceHttpApiHandlerOptions,
  requestId: string,
  session: AuthSessionContext,
): Promise<Awaited<ReturnType<SkillGovernanceStore["listApprovalRequests"]>>[number] | "forbidden" | null> {
  for (const membership of session.organizations) {
    const pending = await options.governanceStore.listApprovalRequests({
      organizationId: membership.organizationId,
      status: "pending",
    });
    const match = pending.find((request) => request.id === requestId);
    if (!match) continue;
    if (canResolveApproval(membership.role, match.requiredRole)) return match;
    return "forbidden";
  }
  return null;
}

function canResolveApproval(
  role: AuthMemberRole,
  requiredRole: "owner" | "admin",
): boolean {
  if (requiredRole === "owner") return role === "owner";
  return role === "owner" || role === "admin";
}

async function requireSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: SkillGovernanceHttpApiHandlerOptions,
): Promise<AuthSessionContext | null> {
  const session = await options.requireUserSession(request);
  if (!session) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

function readMembership(
  session: AuthSessionContext,
  organizationId: string,
): { organizationId: string; role: AuthMemberRole } | null {
  if (!organizationId) return null;
  const membership = session.organizations.find((organization) => organization.organizationId === organizationId);
  return membership ? { organizationId: membership.organizationId, role: membership.role } : null;
}

function selectSkillVersion(versions: SkillVersionRow[], versionId: string): SkillVersionRow | null {
  if (versionId) return versions.find((version) => version.id === versionId) ?? null;
  return versions[0] ?? null;
}

function normalizeResourceType(value: string): GovernanceResourceType | null {
  return value === "skill" || value === "device" || value === "runtime" || value === "agent" ? value : null;
}

function normalizeTargetType(value: string): SkillAssignmentTargetType | null {
  return value === "device" || value === "runtime" || value === "agent" ? value : null;
}

function normalizePermission(value: string): GovernancePermission | null {
  if (
    value === "view"
    || value === "edit"
    || value === "publish"
    || value === "archive"
    || value === "manage_access"
    || value === "manage_skills"
  ) {
    return value;
  }
  return null;
}

function normalizeApprovalStatus(value: string): ApprovalStatus | null {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "cancelled") return value;
  return null;
}

function readString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxJsonBodyChars) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("invalid json body"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
