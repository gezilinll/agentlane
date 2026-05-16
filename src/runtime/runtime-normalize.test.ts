import { describe, expect, it } from "vitest";
import {
  createRuntimeInventorySnapshot,
  summarizeRuntimeInventory,
  type RuntimeAdapterReport,
  type RuntimeDevice,
} from "./runtime-normalize";

const fixtureDevice: RuntimeDevice = {
  id: "gezilinll-claw",
  name: "gezilinll-claw",
  hostname: "gezilinll-clawdeMacBook-Pro.local",
  os: "darwin",
  architecture: "arm64",
  status: "unknown",
  connectionMode: "collector",
};

describe("runtime inventory normalization", () => {
  it("normalizes runtime and agent reports into stable Lorume ids", () => {
    const reports: RuntimeAdapterReport[] = [
      {
        source: "openclaw",
        collectedAt: "2026-05-08T08:00:00.000Z",
        runtimes: [
          {
            externalId: "gateway-18789",
            kind: "openclaw",
            name: "OpenClaw Gateway",
            status: "online",
            version: "2026.4.27",
            capabilities: ["health", "status", "tasks"],
            lastSeenAt: "2026-05-08T08:00:03.000Z",
          },
        ],
        agents: [
          {
            externalId: "main",
            runtimeExternalId: "gateway-18789",
            name: "main",
            origin: "openclaw",
            status: "idle",
            lastSeenAt: "2026-05-08T08:00:02.000Z",
            channelBindings: [{ kind: "dingtalk", label: "DingTalk default", status: "enabled" }],
            load: { historicalSessions: 12 },
          },
        ],
      },
    ] as RuntimeAdapterReport[];

    const snapshot = createRuntimeInventorySnapshot({
      device: fixtureDevice,
      observedAt: "2026-05-08T08:00:01.000Z",
      collector: { version: "0.1.0", status: "online" },
      reports,
    });

    expect(snapshot.device.status).toBe("online");
    expect(snapshot.runtimes[0]).toMatchObject({
      id: "gezilinll-claw:openclaw:gateway-18789",
      deviceId: "gezilinll-claw",
      kind: "openclaw",
      status: "online",
      capabilities: ["health", "status", "tasks"],
      lastSeenAt: "2026-05-08T08:00:03.000Z",
    });
    expect(snapshot.agents[0]).toMatchObject({
      id: "gezilinll-claw:openclaw:gateway-18789:agent:main",
      runtimeId: "gezilinll-claw:openclaw:gateway-18789",
      origin: "openclaw",
      status: "idle",
      lastSeenAt: "2026-05-08T08:00:02.000Z",
      channelBindings: [{ kind: "dingtalk", label: "DingTalk default", status: "enabled" }],
      load: { historicalSessions: 12 },
    });
  });

  it("falls back agent lastSeenAt to the adapter collection time", () => {
    const snapshot = createRuntimeInventorySnapshot({
      device: fixtureDevice,
      observedAt: "2026-05-08T08:00:03.000Z",
      collector: { version: "0.1.0", status: "online" },
      reports: [
        {
          source: "multica",
          collectedAt: "2026-05-08T08:00:02.000Z",
          runtimes: [
            {
              externalId: "runtime-1",
              kind: "codex",
              name: "Codex Runtime",
              status: "online",
              capabilities: ["agent:list"],
            },
          ],
          agents: [
            {
              externalId: "agent-1",
              runtimeExternalId: "runtime-1",
              name: "MiBot",
              origin: "multica",
              status: "idle",
              channelBindings: [{ kind: "multica", label: "Multica", status: "enabled" }],
            },
          ],
        },
      ],
    });

    expect(snapshot.agents[0]?.lastSeenAt).toBe("2026-05-08T08:00:02.000Z");
  });

  it("normalizes discovered Skill packages to the target that owns them", () => {
    const snapshot = createRuntimeInventorySnapshot({
      device: fixtureDevice,
      observedAt: "2026-05-08T08:00:03.000Z",
      collector: { version: "0.1.0", status: "online" },
      reports: [
        {
          source: "openclaw",
          collectedAt: "2026-05-08T08:00:02.000Z",
          runtimes: [
            {
              externalId: "gateway-18789",
              kind: "openclaw",
              name: "OpenClaw Gateway",
              status: "online",
              capabilities: ["skill:discover"],
            },
          ],
          agents: [
            {
              externalId: "main",
              runtimeExternalId: "gateway-18789",
              name: "main",
              origin: "openclaw",
              status: "idle",
              channelBindings: [{ kind: "dingtalk", label: "DingTalk", status: "enabled" }],
            },
          ],
          skillDiscoveries: [
            {
              agentExternalId: "main",
              description: "Review local OpenClaw changes.",
              externalId: "review-skill",
              files: [
                {
                  content: `---
name: Review Skill
description: Review local OpenClaw changes.
license: MIT
compatibility: openclaw
---

# Review Skill
`,
                  path: "SKILL.md",
                },
              ],
              name: "Review Skill",
              packageHash: "hash-review-skill",
              path: "/Users/dev/.openclaw/skills/review-skill",
              runtimeExternalId: "gateway-18789",
              targetType: "agent",
            },
          ],
        },
      ],
    });

    expect(snapshot.skillDiscoveries).toEqual([
      expect.objectContaining({
        agentId: "gezilinll-claw:openclaw:gateway-18789:agent:main",
        deviceId: "gezilinll-claw",
        files: [expect.objectContaining({ path: "SKILL.md" })],
        id: "gezilinll-claw:openclaw:gateway-18789:agent:main:skill:review-skill",
        name: "Review Skill",
        packageHash: "hash-review-skill",
        runtimeId: "gezilinll-claw:openclaw:gateway-18789",
        skillPath: "/Users/dev/.openclaw/skills/review-skill",
        source: "openclaw",
        targetId: "gezilinll-claw:openclaw:gateway-18789:agent:main",
        targetType: "agent",
      }),
    ]);
  });

  it("keeps Slock and Multica as source kinds while preserving underlying runtime kinds", () => {
    const reports: RuntimeAdapterReport[] = [
      {
        source: "multica",
        collectedAt: "2026-05-08T08:00:00.000Z",
        runtimes: [
          {
            externalId: "07b2fc23",
            kind: "openclaw",
            name: "Openclaw (gezilinll-claw)",
            status: "online",
            capabilities: ["agent:list", "runtime:list"],
          },
        ],
        agents: [
          {
            externalId: "cmo-agent",
            runtimeExternalId: "07b2fc23",
            name: "CMO",
            origin: "multica",
            status: "idle",
            channelBindings: [{ kind: "multica", label: "Multica workspace", status: "enabled" }],
          },
        ],
      },
      {
        source: "slock",
        collectedAt: "2026-05-08T08:00:00.000Z",
        runtimes: [
          {
            externalId: "slock-daemon",
            kind: "slock",
            name: "Slock daemon",
            status: "online",
            capabilities: ["agent:start", "agent:deliver"],
          },
        ],
        agents: [
          {
            externalId: "tester",
            runtimeExternalId: "slock-daemon",
            name: "tester",
            origin: "slock",
            status: "active",
            channelBindings: [{ kind: "slock", label: "Slock", status: "enabled" }],
          },
        ],
      },
    ];

    const snapshot = createRuntimeInventorySnapshot({
      device: fixtureDevice,
      observedAt: "2026-05-08T08:00:01.000Z",
      collector: { version: "0.1.0", status: "online" },
      reports,
    });

    expect(snapshot.runtimes.map((runtime) => [runtime.kind, runtime.sourceRefs[0]?.source])).toEqual([
      ["openclaw", "multica"],
      ["slock", "slock"],
    ]);
    expect(snapshot.agents.map((agent) => [agent.name, agent.origin])).toEqual([
      ["CMO", "multica"],
      ["tester", "slock"],
    ]);
  });

  it("summarizes degraded inventory without losing individual statuses", () => {
    const snapshot = createRuntimeInventorySnapshot({
      device: fixtureDevice,
      observedAt: "2026-05-08T08:00:01.000Z",
      collector: { version: "0.1.0", status: "online" },
      reports: [
        {
          source: "openclaw",
          collectedAt: "2026-05-08T08:00:00.000Z",
          runtimes: [
            {
              externalId: "gateway-18789",
              kind: "openclaw",
              name: "OpenClaw Gateway",
              status: "degraded",
              capabilities: ["health"],
              health: { lastError: "task audit has lost tasks" },
            },
          ],
          agents: [],
        },
      ],
    });

    const summary = summarizeRuntimeInventory(snapshot);

    expect(snapshot.device.status).toBe("degraded");
    expect(summary).toEqual({
      deviceStatus: "degraded",
      runtimes: { total: 1, online: 0, degraded: 1, offline: 0, unknown: 0 },
      agents: { total: 0, active: 0, idle: 0, inactive: 0, degraded: 0, unknown: 0 },
      channelKinds: [],
    });
  });
});
