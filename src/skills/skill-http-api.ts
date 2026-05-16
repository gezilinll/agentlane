import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthOrganizationMembership, AuthSessionContext } from "../auth/auth-store";
import {
  createSkillPackageFromGithubUrl,
  createSkillPackageFromMarketplaceUrl,
  createSkillPackageFromMarkdown,
  createSkillPackageFromZip,
  SkillPackageValidationError,
  type SkillPackageSource,
} from "./skill-package";
import type { SkillGovernanceStore } from "./skill-governance-store";
import { SkillDeleteBlockedError, type SkillStore } from "./skill-store";

const maxJsonBodyChars = 10_000_000;

/** Auth guard required by Skill HTTP APIs. */
export interface SkillHttpAuth {
  /** Return the signed-in user session, or `null` when unauthorized. */
  requireUserSession: (request: IncomingMessage) => Promise<AuthSessionContext | null>;
}

/** Dependencies for the Skill HTTP API. */
export interface SkillHttpApiHandlerOptions {
  /** Fetch implementation for remote imports. */
  fetch?: typeof fetch;
  /** Optional governance repository used to enforce resource-level Skill reads. */
  governanceStore?: SkillGovernanceStore;
  /** User-session auth guard. */
  requireUserSession: SkillHttpAuth["requireUserSession"];
  /** Skill repository. */
  skillStore: SkillStore;
}

/** Skill API middleware compatible with the backend runtime API shape. */
export type SkillHttpApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;

/** Create organization-scoped Skill import/read routes. */
export function createSkillHttpApiHandler(options: SkillHttpApiHandlerOptions): SkillHttpApiHandler {
  return async function skillHttpApiHandler(request, response, next) {
    const requestUrl = new URL(request.url || "/", "http://lorume.local");

    if (request.method === "GET" && requestUrl.pathname === "/api/skills") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
      const membership = readOrganizationMembership(session, organizationId);
      if (!ensureOrganizationMember(response, organizationId, membership)) return;
      const skills = await options.skillStore.listSkills({ organizationId });
      const visibleSkills = options.governanceStore
        ? (await Promise.all(skills.map(async (skill) => (
          await canViewSkill(options, session, membership, skill.organizationId, skill.id) ? skill : null
        )))).filter((skill) => skill !== null)
        : skills;
      sendJson(response, 200, {
        skills: visibleSkills,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/skills/import") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const body = await readJsonBody(request);
      const organizationId = readString(body, "organizationId");
      const membership = readOrganizationMembership(session, organizationId);
      if (!ensureOrganizationMember(response, organizationId, membership)) return;

      try {
        const skillPackage = await createPackageFromRequest(body, options.fetch);
        const imported = await options.skillStore.importSkillVersion({
          createdByUserId: session.user.id,
          organizationId,
          package: skillPackage,
        });
        sendJson(response, 201, imported);
      } catch (error) {
        if (error instanceof SkillPackageValidationError) {
          sendJson(response, 422, { error: "skill_package_blocked", validation: error.validation });
          return;
        }
        if (error instanceof UnsupportedSkillSourceError) {
          sendJson(response, 400, { error: "unsupported_skill_source", message: error.message });
          return;
        }
        throw error;
      }
      return;
    }

    const draftVersionMatch = requestUrl.pathname.match(/^\/api\/skills\/([^/]+)\/versions$/);
    if (request.method === "POST" && draftVersionMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const skillId = decodeURIComponent(draftVersionMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const membership = readOrganizationMembership(session, detail.skill.organizationId);
      if (!ensureOrganizationMember(response, detail.skill.organizationId, membership)) return;
      if (!(await canEditSkill(options, session, membership, detail.skill.organizationId, detail.skill.id))) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const body = await readJsonBody(request);
      try {
        const skillPackage = await createPackageFromRequest(body, options.fetch, "manual_edit");
        const draft = await options.skillStore.createSkillDraftVersion({
          createdByUserId: session.user.id,
          package: skillPackage,
          skillId: detail.skill.id,
          summary: readString(body, "summary") || undefined,
        });
        sendJson(response, 201, draft);
      } catch (error) {
        if (error instanceof SkillPackageValidationError) {
          sendJson(response, 422, { error: "skill_package_blocked", validation: error.validation });
          return;
        }
        if (error instanceof UnsupportedSkillSourceError) {
          sendJson(response, 400, { error: "unsupported_skill_source", message: error.message });
          return;
        }
        throw error;
      }
      return;
    }

    const archiveMatch = requestUrl.pathname.match(/^\/api\/skills\/([^/]+)\/archive$/);
    if (request.method === "POST" && archiveMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const skillId = decodeURIComponent(archiveMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const membership = readOrganizationMembership(session, detail.skill.organizationId);
      if (!ensureOrganizationMember(response, detail.skill.organizationId, membership)) return;
      if (!(await canArchiveSkill(options, session, membership, detail.skill.organizationId, detail.skill.id))) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const skill = await options.skillStore.archiveSkill({
        archivedByUserId: session.user.id,
        skillId: detail.skill.id,
      });
      sendJson(response, 200, { skill });
      return;
    }

    const filesMatch = requestUrl.pathname.match(/^\/api\/skills\/([^/]+)\/versions\/([^/]+)\/files$/);
    if (request.method === "GET" && filesMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const skillId = decodeURIComponent(filesMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const membership = readOrganizationMembership(session, detail.skill.organizationId);
      if (!ensureOrganizationMember(response, detail.skill.organizationId, membership)) return;
      if (!(await canViewSkill(options, session, membership, detail.skill.organizationId, detail.skill.id))) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      const skillVersionId = decodeURIComponent(filesMatch[2] ?? "");
      const files = await options.skillStore.readSkillVersionFiles({ skillId, skillVersionId });
      if (files.length === 0 && !detail.versions.some((version) => version.id === skillVersionId)) {
        sendJson(response, 404, { error: "skill_version_not_found" });
        return;
      }
      sendJson(response, 200, { files });
      return;
    }

    const detailMatch = requestUrl.pathname.match(/^\/api\/skills\/([^/]+)$/);
    if (request.method === "DELETE" && detailMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const skillId = decodeURIComponent(detailMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const membership = readOrganizationMembership(session, detail.skill.organizationId);
      if (!ensureOrganizationMember(response, detail.skill.organizationId, membership)) return;
      if (!(await canArchiveSkill(options, session, membership, detail.skill.organizationId, detail.skill.id))) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      try {
        const deleted = await options.skillStore.deleteDraftSkill({ skillId: detail.skill.id });
        sendJson(response, 200, { deletedSkillId: deleted.id });
      } catch (error) {
        if (error instanceof SkillDeleteBlockedError) {
          sendJson(response, 409, { error: "skill_delete_blocked", message: error.message });
          return;
        }
        throw error;
      }
      return;
    }

    if (request.method === "GET" && detailMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const skillId = decodeURIComponent(detailMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      const membership = readOrganizationMembership(session, detail.skill.organizationId);
      if (!ensureOrganizationMember(response, detail.skill.organizationId, membership)) return;
      if (!(await canViewSkill(options, session, membership, detail.skill.organizationId, detail.skill.id))) {
        sendJson(response, 403, { error: "forbidden" });
        return;
      }
      sendJson(response, 200, detail);
      return;
    }

    next();
  };
}

async function createPackageFromRequest(
  body: unknown,
  fetchImpl?: typeof fetch,
  markdownSourceType: SkillPackageSource["type"] = "upload_md",
) {
  const source = readObject(body, "source");
  const type = readString(source, "type");
  if (type === "markdown" || type === "upload_md") {
    return createSkillPackageFromMarkdown({
      content: readRawString(source, "content"),
      filename: readString(source, "filename") || undefined,
      source: createSource(source, markdownSourceType),
    });
  }
  if (type === "zip" || type === "upload_zip") {
    return createSkillPackageFromZip({
      content: readRawString(source, "contentBase64") || readRawString(source, "content"),
      filename: readString(source, "filename") || undefined,
      source: createSource(source, "upload_zip"),
    });
  }
  if (type === "github_url" || type === "github") {
    return createSkillPackageFromGithubUrl({
      fetch: fetchImpl,
      url: readString(source, "url"),
    });
  }
  if (type === "marketplace_url" || type === "marketplace") {
    return createSkillPackageFromMarketplaceUrl({
      fetch: fetchImpl,
      url: readString(source, "url"),
    });
  }
  throw new UnsupportedSkillSourceError(`Skill source ${type || "unknown"} is not supported by the import API yet.`);
}

function createSource(source: unknown, type: SkillPackageSource["type"]): SkillPackageSource {
  return {
    filename: readString(source, "filename") || undefined,
    resolvedRef: readString(source, "resolvedRef") || undefined,
    type,
    url: readString(source, "url") || undefined,
  };
}

async function requireSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: SkillHttpApiHandlerOptions,
): Promise<AuthSessionContext | null> {
  const session = await options.requireUserSession(request);
  if (!session) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

async function canViewSkill(
  options: SkillHttpApiHandlerOptions,
  session: AuthSessionContext,
  membership: AuthOrganizationMembership,
  organizationId: string,
  skillId: string,
): Promise<boolean> {
  if (!options.governanceStore) return true;
  return options.governanceStore.hasResourcePermission({
    organizationId,
    organizationRole: membership.role,
    permission: "view",
    resourceId: skillId,
    resourceType: "skill",
    userId: session.user.id,
  });
}

async function canEditSkill(
  options: SkillHttpApiHandlerOptions,
  session: AuthSessionContext,
  membership: AuthOrganizationMembership,
  organizationId: string,
  skillId: string,
): Promise<boolean> {
  if (!options.governanceStore) return true;
  return options.governanceStore.hasResourcePermission({
    organizationId,
    organizationRole: membership.role,
    permission: "edit",
    resourceId: skillId,
    resourceType: "skill",
    userId: session.user.id,
  });
}

async function canArchiveSkill(
  options: SkillHttpApiHandlerOptions,
  session: AuthSessionContext,
  membership: AuthOrganizationMembership,
  organizationId: string,
  skillId: string,
): Promise<boolean> {
  if (!options.governanceStore) return true;
  return options.governanceStore.hasResourcePermission({
    organizationId,
    organizationRole: membership.role,
    permission: "archive",
    resourceId: skillId,
    resourceType: "skill",
    userId: session.user.id,
  });
}

function readOrganizationMembership(
  session: AuthSessionContext,
  organizationId: string,
): AuthOrganizationMembership | null {
  if (!organizationId) return null;
  return session.organizations.find((organization) => organization.organizationId === organizationId) ?? null;
}

function ensureOrganizationMember(
  response: ServerResponse,
  organizationId: string,
  membership: AuthOrganizationMembership | null,
): membership is AuthOrganizationMembership {
  if (!organizationId) {
    sendJson(response, 400, { error: "organization_id_required" });
    return false;
  }
  if (!membership) {
    sendJson(response, 403, { error: "forbidden" });
    return false;
  }
  return true;
}

function readObject(body: unknown, key: string): unknown {
  if (!body || typeof body !== "object") return {};
  const value = (body as Record<string, unknown>)[key];
  return value && typeof value === "object" ? value : {};
}

function readString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readRawString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
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

class UnsupportedSkillSourceError extends Error {}
