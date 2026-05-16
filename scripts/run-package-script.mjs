#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptName = process.argv[2];
const forwardedArgs = normalizeForwardedArgs(process.argv.slice(3));

if (!scriptName) {
  process.stderr.write("Usage: node scripts/run-package-script.mjs <script-name>\n");
  process.exit(2);
}

const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const command = packageJson.scripts?.[scriptName];

if (!command) {
  process.stderr.write(`Unknown package script: ${scriptName}\n`);
  process.exit(2);
}

const shimDir = path.join(tmpdir(), "lorume-package-runner");
mkdirSync(shimDir, { recursive: true });

const npmShimPath = path.join(shimDir, "npm");
writeFileSync(
  npmShimPath,
  `#!/usr/bin/env sh
if [ "$1" = "run" ]; then
  shift
  exec "${process.execPath}" "${path.join(repoRoot, "scripts/run-package-script.mjs")}" "$@"
fi
echo "lorume npm shim only supports: npm run <script>" >&2
exit 127
`,
);
chmodSync(npmShimPath, 0o755);

const nodeModulesBin = path.join(repoRoot, "node_modules", ".bin");
const nodeBin = path.dirname(process.execPath);
const systemBins = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
const env = {
  ...process.env,
  PATH: [shimDir, nodeModulesBin, nodeBin, process.env.PATH, ...systemBins].filter(Boolean).join(path.delimiter),
};

const commandWithArgs = [command, ...forwardedArgs.map(shellQuote)].join(" ");
const child = spawn(commandWithArgs, {
  cwd: repoRoot,
  env,
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function normalizeForwardedArgs(args) {
  if (args[0] === "--") return args.slice(1);
  return args;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}
