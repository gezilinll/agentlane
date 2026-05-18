#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { hostname, arch, platform } from "node:os";
import path from "node:path";

function parseFlags(argv) {
  const positionals = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "json" || key === "help") {
      flags.set(key, true);
      continue;
    }
    index += 1;
    if (index >= argv.length) throw createCliError("missing_argument", `Missing value for --${key}`, 2);
    const value = argv[index];
    if (key === "allow-root") {
      flags.set(key, [...(flags.get(key) ?? []), value]);
    } else {
      flags.set(key, value);
    }
  }
  return { flags, positionals };
}

function main() {
  const { flags, positionals } = parseFlags(process.argv.slice(2));
  if (flags.get("help") || positionals.length === 0) {
    process.stdout.write(helpText());
    return;
  }

  const [group, command] = positionals;
  if (group === "device" && command === "identify") {
    writeJson(identifyDevice(flags));
    return;
  }
  if (group === "runtime" && command === "list") {
    writeJson(listRuntimes(flags));
    return;
  }
  if (group === "connector" && command === "status") {
    writeJson(readConnectorStatus(flags));
    return;
  }
  if (group === "files" && command === "copy") {
    writeJson(copyExplicitPath(flags));
    return;
  }

  throw createCliError("unsupported_command", `Unsupported lorume command: ${positionals.join(" ")}`, 2);
}

function identifyDevice(flags) {
  const observedAt = new Date().toISOString();
  const deviceId = stringFlag(flags, "device-id") || process.env.LORUME_DEVICE_ID || sanitizeId(hostname());
  const deviceName = stringFlag(flags, "device-name") || process.env.LORUME_DEVICE_NAME || deviceId;
  return {
    command: "device.identify",
    observedAt,
    device: {
      architecture: arch(),
      connectionMode: "collector",
      hostname: hostname(),
      id: deviceId,
      name: deviceName,
      os: platform(),
    },
  };
}

function listRuntimes(flags) {
  const snapshotPath = requireFlag(flags, "snapshot");
  const snapshot = readJson(snapshotPath);
  if (!snapshot || typeof snapshot !== "object") {
    throw createCliError("invalid_snapshot", "Runtime snapshot must be a JSON object", 2);
  }
  return {
    agents: Array.isArray(snapshot.agents) ? snapshot.agents : [],
    command: "runtime.list",
    device: snapshot.device ?? null,
    observedAt: typeof snapshot.observedAt === "string" ? snapshot.observedAt : null,
    runtimes: Array.isArray(snapshot.runtimes) ? snapshot.runtimes : [],
  };
}

function readConnectorStatus(flags) {
  const contextPath = requireFlag(flags, "context");
  const target = requireFlag(flags, "target");
  const context = readJson(contextPath);
  const connectors = Array.isArray(context.connectors) ? context.connectors : [];
  const connector = connectors.find((candidate) => candidate && candidate.id === target);
  if (!connector) {
    throw createCliError("not_found", `Connector is not present in authorized context: ${target}`, 3);
  }
  return {
    command: "connector.status",
    connector,
  };
}

function copyExplicitPath(flags) {
  const from = requireFlag(flags, "from");
  const to = requireFlag(flags, "to");
  const allowRoots = flags.get("allow-root") ?? [];
  if (allowRoots.length === 0) {
    throw createCliError("missing_allow_root", "files copy requires at least one --allow-root", 2);
  }
  const resolvedRoots = allowRoots.map((root) => path.resolve(root));
  const sourcePath = path.resolve(from);
  const destinationPath = path.resolve(to);
  if (!isAllowedPath(sourcePath, resolvedRoots) || !isAllowedPath(destinationPath, resolvedRoots)) {
    throw createCliError("unsafe_path", "Source and destination must stay inside allowed roots", 2);
  }
  if (!existsSync(sourcePath)) {
    throw createCliError("not_found", `Source path does not exist: ${sourcePath}`, 3);
  }
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, { recursive: statSync(sourcePath).isDirectory() });
  return {
    command: "files.copy",
    destinationPath,
    sourcePath,
    status: "copied",
  };
}

function isAllowedPath(candidate, roots) {
  return roots.some((root) => {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw createCliError("invalid_json", error instanceof Error ? error.message : "Invalid JSON", 2);
  }
}

function requireFlag(flags, key) {
  const value = stringFlag(flags, key);
  if (!value) throw createCliError("missing_argument", `Missing --${key}`, 2);
  return value;
}

function stringFlag(flags, key) {
  const value = flags.get(key);
  return typeof value === "string" ? value : "";
}

function sanitizeId(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function createCliError(code, message, exitCode) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  return error;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeError(error) {
  const code = typeof error.code === "string" ? error.code : "cli_error";
  const message = error instanceof Error && error.message ? error.message : "Lorume CLI failed";
  process.stderr.write(`${JSON.stringify({ error: code, message })}\n`);
  process.exitCode = typeof error.exitCode === "number" ? error.exitCode : 1;
}

function helpText() {
  return `Usage: lorume <command> [options]

Commands:
  lorume device identify --json [--device-id <id>] [--device-name <name>]
  lorume runtime list --json --snapshot <path>
  lorume connector status --json --context <path> --target <id>
  lorume files copy --json --from <path> --to <path> --allow-root <path>
`;
}

try {
  main();
} catch (error) {
  writeError(error);
}
