#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required_paths=(
  "README.md"
  "AGENTS.md"
  "docs/product/ui-design.md"
  "docs/product/catalog-page-spec.md"
  "docs/product/runtime-device-registration-spec.md"
  "docs/product/runtime-fleet-page-spec.md"
  "docs/product/runtime-work-state-probe.md"
  "docs/product/runtime-listening-acceptance-spec.md"
  "playwright.config.ts"
  "e2e/catalog-layout.spec.ts"
  "e2e/catalog-workflow.spec.ts"
  "e2e/runtime-fleet.spec.ts"
  "src/catalog/catalog-object.ts"
  "src/catalog/index.ts"
  "src/runtime/runtime-inventory-query.ts"
  "src/runtime/runtime-normalize.ts"
  "src/server/runtime-inventory-store.ts"
  "scripts/agentlane-device-collector.mjs"
  "scripts/install-device-collector.sh"
  "fixtures/runtime/collector-snapshot.sample.json"
  "docs/product/agent-network-runtime-panorama.png"
  "docs/product/agent-network-build-objects.png"
  "assets/product-ui/01-command-center.png"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "check:repo: missing required path: $path" >&2
    exit 1
  fi
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "check:repo: python3 is required for Markdown link checks" >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import re
import sys
import urllib.parse

root = Path.cwd().resolve()
markdown_files = [
    Path("README.md"),
    Path("AGENTS.md"),
    Path("docs/product/ui-design.md"),
    Path("docs/product/catalog-page-spec.md"),
    Path("docs/product/runtime-device-registration-spec.md"),
    Path("docs/product/runtime-fleet-page-spec.md"),
    Path("docs/product/runtime-work-state-probe.md"),
    Path("docs/product/runtime-listening-acceptance-spec.md"),
]

problems = []
link_pattern = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")

for md_path in markdown_files:
    text = md_path.read_text(encoding="utf-8")
    for match in link_pattern.finditer(text):
        raw_target = match.group(1).strip()
        if not raw_target or raw_target.startswith(("#", "http://", "https://", "mailto:")):
            continue

        target = raw_target.split("#", 1)[0].strip()
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1]
        if not target:
            continue

        target = urllib.parse.unquote(target)
        resolved = (root / md_path.parent / target).resolve()

        try:
            resolved.relative_to(root)
        except ValueError:
            problems.append(f"{md_path}: link escapes repository: {raw_target}")
            continue

        if not resolved.exists():
            display = resolved.relative_to(root)
            problems.append(f"{md_path}: missing link target {raw_target} -> {display}")

if problems:
    print("check:repo: Markdown link check failed", file=sys.stderr)
    for problem in problems:
        print(f"- {problem}", file=sys.stderr)
    sys.exit(1)
PY

echo "check:repo: ok"
