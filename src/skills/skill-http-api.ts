import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSessionContext } from "../auth/auth-store";
import {
  createSkillPackageFromGithubUrl,
  createSkillPackageFromMarketplaceUrl,
  createSkillPackageFromMarkdown,
  createSkillPackageFromZip,
  SkillPackageValidationError,
  type SkillPackageSource,
} from "./skill-package";
import type { SkillStore } from "./skill-store";

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
    const requestUrl = new URL(request.url || "/", "http://agentlane.local");

    if (request.method === "GET" && requestUrl.pathname === "/api/skills") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
      if (!ensureOrganizationMember(session, response, organizationId)) return;
      sendJson(response, 200, {
        skills: await options.skillStore.listSkills({ organizationId }),
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/skills/import") {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const body = await readJsonBody(request);
      const organizationId = readString(body, "organizationId");
      if (!ensureOrganizationMember(session, response, organizationId)) return;

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
      if (!ensureOrganizationMember(session, response, detail.skill.organizationId)) return;
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
    if (request.method === "GET" && detailMatch) {
      const session = await requireSession(request, response, options);
      if (!session) return;
      const skillId = decodeURIComponent(detailMatch[1] ?? "");
      const detail = await options.skillStore.readSkillDetail({ skillId });
      if (!detail) {
        sendJson(response, 404, { error: "skill_not_found" });
        return;
      }
      if (!ensureOrganizationMember(session, response, detail.skill.organizationId)) return;
      sendJson(response, 200, detail);
      return;
    }

    next();
  };
}

async function createPackageFromRequest(body: unknown, fetchImpl?: typeof fetch) {
  const source = readObject(body, "source");
  const type = readString(source, "type");
  if (type === "markdown" || type === "upload_md") {
    return createSkillPackageFromMarkdown({
      content: readRawString(source, "content"),
      filename: readString(source, "filename") || undefined,
      source: createSource(source, "upload_md"),
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

function ensureOrganizationMember(
  session: AuthSessionContext,
  response: ServerResponse,
  organizationId: string,
): boolean {
  if (!organizationId) {
    sendJson(response, 400, { error: "organization_id_required" });
    return false;
  }
  if (!session.organizations.some((organization) => organization.organizationId === organizationId)) {
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
