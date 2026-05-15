import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntimeControlChannel, type RuntimeControlSocket } from "./runtime-control-channel";
import { createRuntimeInventoryStore } from "./runtime-inventory-store";

class MemorySocket implements RuntimeControlSocket {
  readonly sent: unknown[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
}

describe("runtime control channel", () => {
  it("registers a device through hello and updates heartbeat state", () => {
    const store = createStore();
    const currentTime = new Date("2026-05-08T08:00:00.000Z");
    const channel = createRuntimeControlChannel({
      store,
      now: () => currentTime,
    });
    const socket = new MemorySocket();

    channel.attach(socket);
    channel.receive(socket, JSON.stringify({
      type: "hello",
      deviceId: "fixture-mac",
      deviceName: "Fixture Mac",
      collectorVersion: "0.1.0",
      hostname: "fixture-mac.local",
    }));

    expect(store.readDeviceConnection("fixture-mac", currentTime)).toMatchObject({
      deviceId: "fixture-mac",
      status: "online",
      collectorVersion: "0.1.0",
      hostname: "fixture-mac.local",
    });
    expect(socket.sent).toContainEqual(expect.objectContaining({ type: "hello.ack", deviceId: "fixture-mac" }));

    channel.receive(socket, JSON.stringify({
      type: "heartbeat",
      deviceId: "fixture-mac",
      collectorVersion: "0.1.0",
      summary: { activeTasks: 2 },
    }));

    expect(store.readDeviceConnection("fixture-mac", currentTime)).toMatchObject({
      status: "online",
      lastHeartbeatAt: "2026-05-08T08:00:00.000Z",
      summary: { activeTasks: 2 },
    });
  });

  it("marks a registered device offline when its socket disconnects", () => {
    const store = createStore();
    const channel = createRuntimeControlChannel({
      store,
      now: () => new Date("2026-05-08T08:00:00.000Z"),
    });
    const socket = new MemorySocket();

    channel.attach(socket);
    channel.receive(socket, JSON.stringify({ type: "hello", deviceId: "fixture-mac" }));
    channel.detach(socket, "socket closed");

    expect(store.readDeviceConnection("fixture-mac")).toMatchObject({
      deviceId: "fixture-mac",
      status: "offline",
      lastError: "socket closed",
    });
  });

  it("dispatches an inventory refresh command and records accepted and result messages", () => {
    const store = createStore();
    let currentTime = new Date("2026-05-08T08:00:00.000Z");
    const channel = createRuntimeControlChannel({
      store,
      now: () => currentTime,
      createCommandId: () => "cmd-refresh-1",
    });
    const socket = new MemorySocket();

    channel.attach(socket);
    channel.receive(socket, JSON.stringify({ type: "hello", deviceId: "fixture-mac" }));

    const command = channel.requestInventoryRefresh("fixture-mac");

    expect(command).toMatchObject({
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
      status: "sent",
      type: "inventory.refresh",
    });
    expect(socket.sent).toContainEqual(expect.objectContaining({
      type: "inventory.refresh",
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
    }));

    currentTime = new Date("2026-05-08T08:00:01.000Z");
    channel.receive(socket, JSON.stringify({
      type: "command.accepted",
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
    }));
    currentTime = new Date("2026-05-08T08:00:03.000Z");
    channel.receive(socket, JSON.stringify({
      type: "command.result",
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
      status: "succeeded",
      result: { observedAt: "2026-05-08T08:00:02.000Z" },
    }));

    expect(store.readRuntimeCommand("cmd-refresh-1")).toMatchObject({
      status: "succeeded",
      acceptedAt: "2026-05-08T08:00:01.000Z",
      completedAt: "2026-05-08T08:00:03.000Z",
      result: { observedAt: "2026-05-08T08:00:02.000Z" },
    });
  });

  it("rejects refresh requests for disconnected devices", () => {
    const store = createStore();
    const channel = createRuntimeControlChannel({ store });

    expect(() => channel.requestInventoryRefresh("missing-device")).toThrow(/not connected/i);
  });

  it("dispatches Skill sync commands with target and file payloads", () => {
    const store = createStore();
    const channel = createRuntimeControlChannel({
      store,
      createCommandId: () => "cmd-sync-1",
      now: () => new Date("2026-05-14T10:00:00.000Z"),
    });
    const socket = new MemorySocket();

    channel.attach(socket);
    channel.receive(socket, JSON.stringify({ type: "hello", deviceId: "fixture-mac" }));

    const command = channel.requestSkillSync("fixture-mac", {
      assignmentId: "assignment_1",
      files: [
        {
          content: "# Shared Skill\n",
          contentHash: "sha256:file",
          path: "SKILL.md",
          sizeBytes: 15,
        },
      ],
      organizationId: "org_1",
      packageHash: "sha256:package",
      skillId: "skill_1",
      skillSlug: "shared-skill",
      skillVersionId: "version_1",
      targetId: "fixture-mac:codex:local:agent:main",
      targetType: "agent",
    });

    expect(command).toMatchObject({
      commandId: "cmd-sync-1",
      deviceId: "fixture-mac",
      status: "sent",
      type: "skill.sync",
    });
    expect(socket.sent).toContainEqual(expect.objectContaining({
      commandId: "cmd-sync-1",
      deviceId: "fixture-mac",
      payload: expect.objectContaining({
        assignmentId: "assignment_1",
        skillSlug: "shared-skill",
        targetType: "agent",
      }),
      type: "skill.sync",
    }));
  });
});

function createStore() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "lorume-control-store-"));
  return createRuntimeInventoryStore({
    snapshotPath: path.join(dataDir, "latest.json"),
    staleAfterMs: 24 * 60 * 60 * 1000,
  });
}
