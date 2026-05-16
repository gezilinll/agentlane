import { createHash } from "node:crypto";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

/** Supported source channels for an imported Skill package. */
export type SkillPackageSourceType = "upload_md" | "upload_zip" | "github_url" | "marketplace_url" | "manual_edit";

/** Durable source metadata recorded with an imported Skill package. */
export interface SkillPackageSource {
  /** Import source type. */
  type: SkillPackageSourceType;
  /** Optional source URL for remote imports. */
  url?: string;
  /** Optional source filename for uploaded packages. */
  filename?: string;
  /** Optional resolved reference such as a GitHub commit SHA. */
  resolvedRef?: string;
}

/** File inside a normalized Skill package. */
export interface SkillPackageFile {
  /** POSIX package-relative path. */
  path: string;
  /** UTF-8 file content. */
  content: string;
  /** SHA-256 hash of the file content. */
  contentHash: string;
  /** UTF-8 byte size. */
  sizeBytes: number;
}

/** Metadata extracted from `SKILL.md` frontmatter. */
export interface SkillPackageMetadata {
  /** Human-readable Skill name. */
  name: string;
  /** Short Skill description used by list/detail pages. */
  description: string;
  /** Optional SPDX-like license expression. */
  license?: string;
  /** Optional runtime or environment compatibility declaration. */
  compatibility?: string;
}

/** Static package validation issue. */
export interface SkillPackageValidationIssue {
  /** Stable machine code for harness assertions and UI mapping. */
  code: string;
  /** Human-readable validation message. */
  message: string;
  /** Package path related to the issue, when available. */
  path?: string;
  /** Issue severity. */
  severity: "warning" | "blocked";
}

/** Static validation result for a Skill package. */
export interface SkillPackageValidationResult {
  /** Overall validation status. */
  status: "passed" | "warning" | "blocked";
  /** Validation issues found by deterministic checks. */
  issues: SkillPackageValidationIssue[];
}

/** Normalized, immutable Skill package ready to persist as a version. */
export interface NormalizedSkillPackage {
  /** Normalized file tree. */
  files: SkillPackageFile[];
  /** SHA-256 hash across normalized paths and content hashes. */
  packageHash: string;
  /** Extracted metadata. */
  metadata: SkillPackageMetadata;
  /** Original source metadata. */
  source: SkillPackageSource;
  /** Static validation result. */
  validation: SkillPackageValidationResult;
}

/** Raised when a package fails blocking static validation. */
export class SkillPackageValidationError extends Error {
  /** Static validation result with blocking issues. */
  readonly validation: SkillPackageValidationResult;

  constructor(validation: SkillPackageValidationResult) {
    super(validation.issues.find((issue) => issue.severity === "blocked")?.message ?? "skill package validation failed");
    this.name = "SkillPackageValidationError";
    this.validation = validation;
  }
}

/** Input for a single Markdown upload. */
export interface SkillMarkdownInput {
  /** Markdown content uploaded by the user. */
  content: string;
  /** Original filename, if available. */
  filename?: string;
  /** Durable source metadata. */
  source: SkillPackageSource;
}

/** Input for a ZIP upload. */
export interface SkillZipInput {
  /** Base64 encoded ZIP content. */
  content: string;
  /** Original filename, if available. */
  filename?: string;
  /** Durable source metadata. */
  source: SkillPackageSource;
}

/** Input for importing a Skill package from a GitHub directory URL. */
export interface SkillGithubUrlInput {
  /** GitHub repository tree or blob URL. */
  url: string;
  /** Fetch implementation used by tests and runtime code. */
  fetch?: typeof fetch;
}

/** Input for importing a Skill package from a marketplace download URL. */
export interface SkillMarketplaceUrlInput {
  /** Marketplace URL that returns Markdown or ZIP package content. */
  url: string;
  /** Fetch implementation used by tests and runtime code. */
  fetch?: typeof fetch;
}

/** Input for a normalized file package. */
export interface SkillFilePackageInput {
  /** Raw package files. */
  files: Array<{ content: string; path: string }>;
  /** Durable source metadata. */
  source: SkillPackageSource;
}

const maxFileBytes = 1_000_000;
const maxTotalBytes = 8_000_000;
const maxFiles = 128;
const maxDepth = 4;
const knownSpdxLicenses = new Set([
  "AGPL-3.0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "GPL-3.0",
  "ISC",
  "LGPL-3.0",
  "MIT",
  "MPL-2.0",
  "UNLICENSED",
]);

/** Normalize a single Markdown upload as a package containing `SKILL.md`. */
export function createSkillPackageFromMarkdown(input: SkillMarkdownInput): NormalizedSkillPackage {
  return createSkillPackageFromFiles({
    files: [{ content: input.content, path: "SKILL.md" }],
    source: { ...input.source, filename: input.filename ?? input.source.filename },
  });
}

/** Normalize a ZIP upload into a package rooted at its unique `SKILL.md`. */
export function createSkillPackageFromZip(input: SkillZipInput): NormalizedSkillPackage {
  const archive = unzipSync(Buffer.from(input.content, "base64"));
  const files = Object.entries(archive)
    .filter(([entryPath]) => !entryPath.endsWith("/"))
    .map(([entryPath, content]) => ({
      content: strFromU8(content),
      path: entryPath,
    }));

  const root = findPackageRoot(files.map((file) => file.path));
  return createSkillPackageFromFiles({
    files: files.map((file) => ({
      content: file.content,
      path: stripPackageRoot(file.path, root || commonFirstDirectory(files.map((item) => item.path))),
    })),
    source: { ...input.source, filename: input.filename ?? input.source.filename },
  });
}

/** Import a Skill package from a GitHub repository tree or blob URL. */
export async function createSkillPackageFromGithubUrl(input: SkillGithubUrlInput): Promise<NormalizedSkillPackage> {
  const parsed = parseGithubUrl(input.url);
  const fetchImpl = input.fetch ?? fetch;
  const apiPath = parsed.path ? `/${parsed.path}` : "";
  const files = await fetchGithubContentFiles({
    fetchImpl,
    url: `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents${apiPath}?ref=${encodeURIComponent(parsed.ref)}`,
  });
  const root = findPackageRoot(files.map((file) => file.path)) || commonFirstDirectory(files.map((file) => file.path));
  const skillFile = files.find((file) => stripPackageRoot(file.path, root) === "SKILL.md");
  return createSkillPackageFromFiles({
    files: files.map((file) => ({
      content: file.content,
      path: stripPackageRoot(file.path, root),
    })),
    source: {
      resolvedRef: skillFile?.sha ?? files[0]?.sha,
      type: "github_url",
      url: input.url,
    },
  });
}

/** Import a Skill package from a marketplace URL returning Markdown or ZIP content. */
export async function createSkillPackageFromMarketplaceUrl(input: SkillMarketplaceUrlInput): Promise<NormalizedSkillPackage> {
  const parsed = new URL(input.url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Marketplace URL must use http or https.");
  }
  const fetchImpl = input.fetch ?? fetch;
  const response = await fetchImpl(input.url);
  if (!response.ok) throw new Error(`Marketplace package request failed with ${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const source: SkillPackageSource = { type: "marketplace_url", url: input.url };
  if (contentType.includes("zip") || parsed.pathname.toLowerCase().endsWith(".zip")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return createSkillPackageFromZip({
      content: buffer.toString("base64"),
      filename: parsed.pathname.split("/").pop() || undefined,
      source,
    });
  }
  if (contentType.includes("markdown") || contentType.includes("text/plain") || parsed.pathname.toLowerCase().endsWith(".md")) {
    return createSkillPackageFromMarkdown({
      content: await response.text(),
      filename: parsed.pathname.split("/").pop() || undefined,
      source,
    });
  }
  throw new Error("Marketplace URL must return Markdown or ZIP package content.");
}

/** Normalize and statically validate package files. */
export function createSkillPackageFromFiles(input: SkillFilePackageInput): NormalizedSkillPackage {
  const issues: SkillPackageValidationIssue[] = [];
  const normalizedFiles = input.files.map((file) => normalizeFile(file, issues));
  const filteredFiles = normalizedFiles.filter((file): file is SkillPackageFile => Boolean(file));
  const skillFiles = filteredFiles.filter((file) => file.path === "SKILL.md");
  const totalBytes = filteredFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  if (filteredFiles.length > maxFiles) {
    issues.push(blocked("too_many_files", `Skill package has ${filteredFiles.length} files; maximum is ${maxFiles}.`));
  }
  if (totalBytes > maxTotalBytes) {
    issues.push(blocked("package_too_large", `Skill package is ${totalBytes} bytes; maximum is ${maxTotalBytes}.`));
  }
  if (skillFiles.length !== 1) {
    issues.push(blocked("skill_md_required", "Skill package must contain exactly one SKILL.md at the package root."));
  }

  const metadata = skillFiles[0] ? readSkillMetadata(skillFiles[0].content, issues) : {
    description: "",
    name: "",
  };
  addNonBlockingWarnings(filteredFiles, metadata, issues);
  const validation = buildValidation(issues);
  if (validation.status === "blocked") throw new SkillPackageValidationError(validation);

  const sortedFiles = filteredFiles.sort((left, right) => {
    if (left.path === "SKILL.md") return -1;
    if (right.path === "SKILL.md") return 1;
    return left.path.localeCompare(right.path);
  });
  return {
    files: sortedFiles,
    metadata,
    packageHash: hashPackage(sortedFiles),
    source: input.source,
    validation,
  };
}

function normalizeFile(
  file: { content: string; path: string },
  issues: SkillPackageValidationIssue[],
): SkillPackageFile | null {
  const normalizedPath = normalizePackagePath(file.path);
  if (!normalizedPath) {
    issues.push(blocked("path_escape", "Skill package file path must stay inside the package root.", file.path));
    return null;
  }
  const sizeBytes = Buffer.byteLength(file.content, "utf8");
  if (sizeBytes > maxFileBytes) {
    issues.push(blocked("file_too_large", `Skill package file exceeds ${maxFileBytes} bytes.`, normalizedPath));
  }
  if (normalizedPath.split("/").length > maxDepth) {
    issues.push(blocked("path_too_deep", `Skill package file depth exceeds ${maxDepth}.`, normalizedPath));
  }
  if (/[\u0000-\u001f\u007f]/.test(normalizedPath)) {
    issues.push(blocked("path_control_character", "Skill package file path contains a control character.", normalizedPath));
  }
  return {
    content: file.content,
    contentHash: sha256(file.content),
    path: normalizedPath,
    sizeBytes,
  };
}

function normalizePackagePath(rawPath: string): string | null {
  if (rawPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rawPath)) return null;
  const slashPath = rawPath.replaceAll("\\", "/");
  if (!slashPath || slashPath.startsWith("../") || slashPath.includes("/../") || slashPath === "..") return null;
  const normalized = path.posix.normalize(slashPath);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized;
}

function readSkillMetadata(content: string, issues: SkillPackageValidationIssue[]): SkillPackageMetadata {
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    issues.push(blocked("frontmatter_required", "SKILL.md must start with YAML frontmatter."));
    return { description: "", name: "" };
  }

  const name = readFrontmatterString(frontmatter, "name");
  const description = readFrontmatterString(frontmatter, "description");
  if (!name) issues.push(blocked("name_required", "SKILL.md frontmatter must include name."));
  if (!description) issues.push(blocked("description_required", "SKILL.md frontmatter must include description."));
  const license = readFrontmatterString(frontmatter, "license");
  const compatibility = readFrontmatterString(frontmatter, "compatibility");
  return { compatibility, description, license, name };
}

function parseFrontmatter(content: string): Map<string, string> | null {
  if (!content.startsWith("---\n")) return null;
  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) return null;
  const lines = content.slice(4, endIndex).split("\n");
  const data = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    data.set(match[1].toLowerCase(), match[2].trim().replace(/^["']|["']$/g, ""));
  }
  return data;
}

function readFrontmatterString(frontmatter: Map<string, string>, key: string): string {
  return frontmatter.get(key)?.trim() ?? "";
}

function addNonBlockingWarnings(
  files: SkillPackageFile[],
  metadata: SkillPackageMetadata,
  issues: SkillPackageValidationIssue[],
): void {
  if (metadata.license && !knownSpdxLicenses.has(metadata.license)) {
    issues.push(warning("license_unknown", "Skill license is not in the known SPDX allowlist."));
  }
  if (!metadata.license) {
    issues.push(warning("license_missing", "Skill package should declare a license before publishing."));
  }
  if (!metadata.compatibility) {
    issues.push(warning("compatibility_missing", "Skill package should declare runtime compatibility before publishing."));
  }
  for (const file of files) {
    if (/^scripts\//.test(file.path) || /\.(sh|bash|zsh|ps1|cmd|bat|mjs|cjs|js|ts)$/.test(file.path) || file.content.startsWith("#!")) {
      issues.push(warning("script_risk", "Skill package includes executable or script-like content.", file.path));
    }
    if (/(^|\/)(package-lock\.json|package\.json|requirements\.txt|pyproject\.toml|Cargo\.toml)$/.test(file.path)) {
      issues.push(warning("dependency_file", "Skill package includes dependency metadata that requires human review.", file.path));
    }
    if (/\.(zip|tar|gz|tgz|rar|7z)$/i.test(file.path)) {
      issues.push(warning("nested_archive", "Skill package includes a nested archive that requires human review.", file.path));
    }
  }
}

function buildValidation(issues: SkillPackageValidationIssue[]): SkillPackageValidationResult {
  if (issues.some((issue) => issue.severity === "blocked")) return { issues, status: "blocked" };
  if (issues.length > 0) return { issues, status: "warning" };
  return { issues: [], status: "passed" };
}

function findPackageRoot(paths: string[]): string {
  const skillPaths = paths
    .map((entryPath) => normalizePackagePath(entryPath))
    .filter((entryPath): entryPath is string => Boolean(entryPath))
    .filter((entryPath) => entryPath === "SKILL.md" || entryPath.endsWith("/SKILL.md"));
  if (skillPaths.length !== 1) return "";
  return skillPaths[0] === "SKILL.md" ? "" : skillPaths[0].slice(0, -"SKILL.md".length);
}

function stripPackageRoot(entryPath: string, root: string): string {
  const normalized = normalizePackagePath(entryPath) ?? entryPath;
  return root && normalized.startsWith(root) ? normalized.slice(root.length) : normalized;
}

function commonFirstDirectory(paths: string[]): string {
  const normalizedPaths = paths.map((entryPath) => normalizePackagePath(entryPath)).filter((entryPath): entryPath is string => Boolean(entryPath));
  const firstSegments = new Set(normalizedPaths.map((entryPath) => entryPath.split("/")[0]).filter(Boolean));
  return firstSegments.size === 1 ? `${[...firstSegments][0]}/` : "";
}

interface ParsedGithubUrl {
  owner: string;
  path: string;
  ref: string;
  repo: string;
}

interface GithubContentFile {
  content: string;
  path: string;
  sha?: string;
}

interface GithubContentEntry {
  content?: string;
  download_url?: string | null;
  encoding?: string;
  path?: string;
  sha?: string;
  type?: string;
  url?: string;
}

async function fetchGithubContentFiles(input: {
  fetchImpl: typeof fetch;
  url: string;
}): Promise<GithubContentFile[]> {
  const response = await input.fetchImpl(input.url);
  if (!response.ok) throw new Error(`GitHub contents request failed with ${response.status}`);
  const payload = await response.json() as GithubContentEntry | GithubContentEntry[];
  const entries = Array.isArray(payload) ? payload : [payload];
  const files: GithubContentFile[] = [];

  for (const entry of entries) {
    if (entry.type === "dir" && entry.url) {
      files.push(...await fetchGithubContentFiles({ fetchImpl: input.fetchImpl, url: entry.url }));
      continue;
    }
    if (entry.type !== "file" || !entry.path) continue;
    const content = await readGithubFileContent(input.fetchImpl, entry);
    files.push({ content, path: entry.path, sha: entry.sha });
  }
  return files;
}

async function readGithubFileContent(fetchImpl: typeof fetch, entry: GithubContentEntry): Promise<string> {
  if (entry.download_url) {
    const response = await fetchImpl(entry.download_url);
    if (!response.ok) throw new Error(`GitHub raw file request failed with ${response.status}`);
    return response.text();
  }
  if (entry.encoding === "base64" && entry.content) {
    return Buffer.from(entry.content.replace(/\s/g, ""), "base64").toString("utf8");
  }
  return entry.content ?? "";
}

function parseGithubUrl(url: string): ParsedGithubUrl {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") throw new Error("Only github.com URLs are supported.");
  const [owner, repo, mode, ref, ...pathParts] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new Error("GitHub URL must include owner and repository.");
  if (!mode || !ref) {
    return { owner, path: "", ref: "main", repo: repo.replace(/\.git$/, "") };
  }
  if (mode !== "tree" && mode !== "blob") throw new Error("GitHub URL must point to a repository tree or file.");
  return {
    owner,
    path: pathParts.join("/"),
    ref,
    repo: repo.replace(/\.git$/, ""),
  };
}

function hashPackage(files: SkillPackageFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.contentHash);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function blocked(code: string, message: string, issuePath?: string): SkillPackageValidationIssue {
  return { code, message, path: issuePath, severity: "blocked" };
}

function warning(code: string, message: string, issuePath?: string): SkillPackageValidationIssue {
  return { code, message, path: issuePath, severity: "warning" };
}
