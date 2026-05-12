#!/usr/bin/env node

const baseUrl = new URL(process.env.AGENTLANE_BASE_URL || "https://agentlane.gezilinll.com");
const deviceId = process.env.AGENTLANE_DEVICE_ID || "gezilinll-claw";
const timeoutMs = Number(process.env.AGENTLANE_SMOKE_TIMEOUT_MS || 10_000);

const checks = [
  {
    name: "healthz",
    path: "/healthz",
    validate: (body) => body?.ok === true,
  },
  {
    name: "readyz",
    path: "/readyz",
    validate: (body) => body?.ok === true,
  },
  {
    name: "runtime fleet",
    path: "/api/runtime-fleet",
    validate: (body) => Array.isArray(body?.devices) && Array.isArray(body?.runtimes) && Array.isArray(body?.agents),
  },
  {
    name: "work items",
    path: "/api/runtime-work-items?limit=1",
    validate: (body) => Array.isArray(body?.items) && typeof body?.total === "number",
  },
  {
    name: "collection health",
    path: `/api/devices/${encodeURIComponent(deviceId)}/collection-health`,
    validate: (body) => body?.deviceId === deviceId && Array.isArray(body?.checks),
  },
];

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const body = await fetchJson(url);
  if (!check.validate(body)) {
    fail(`${check.name} returned an unexpected payload`);
  }
  process.stdout.write(`smoke:${check.name}: ok\n`);
}

process.stdout.write(`smoke: ok ${baseUrl.toString()}\n`);

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) fail(`${url.pathname} failed with HTTP ${response.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      fail(`${url.pathname} did not return JSON`);
    }
  } catch (error) {
    fail(`${url.pathname} request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function fail(message) {
  process.stderr.write(`smoke: failed: ${message}\n`);
  process.exit(1);
}
