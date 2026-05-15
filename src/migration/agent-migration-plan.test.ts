import { describe, expect, it } from "vitest";
import { createAgentMigrationPlan, describeMigrationCapability } from "./agent-migration-plan";

describe("agent migration planning", () => {
  it("describes current runtime migration capabilities without platform-specific UI logic", () => {
    expect(describeMigrationCapability("openclaw")).toMatchObject({
      createAgent: "supported",
      detectRuntime: "supported",
      syncSkill: "supported",
    });
    expect(describeMigrationCapability("multica")).toMatchObject({
      createAgent: "supported",
      detectRuntime: "supported",
      syncSkill: "supported",
    });
    expect(describeMigrationCapability("slock")).toMatchObject({
      createAgent: "partial",
      detectRuntime: "supported",
      syncSkill: "requires_manual_step",
    });
    expect(describeMigrationCapability("codex")).toMatchObject({
      createAgent: "requires_manual_step",
      detectRuntime: "supported",
      syncSkill: "supported",
    });
  });

  it("creates an executable OpenClaw migration plan when the target device and runtime are ready", () => {
    const plan = createAgentMigrationPlan({
      desiredChannels: ["DingTalk"],
      sourceAgentName: "main",
      sourceRuntimeKind: "openclaw",
      targetDeviceOnline: true,
      targetRuntimeKind: "openclaw",
    });

    expect(plan).toMatchObject({
      status: "ready",
      targetRuntimeKind: "openclaw",
    });
    expect(plan.steps.map((step) => step.action)).toEqual([
      "detect_runtime",
      "create_agent",
      "sync_skill",
      "configure_channel",
      "verify_agent",
    ]);
    expect(plan.steps.find((step) => step.action === "configure_channel")).toMatchObject({
      label: "恢复 Channel：DingTalk",
      status: "partial",
    });
  });

  it("stops with a manual instruction when the target device is offline", () => {
    expect(createAgentMigrationPlan({
      sourceAgentName: "PMO",
      sourceRuntimeKind: "multica",
      targetDeviceOnline: false,
      targetRuntimeKind: "multica",
    })).toMatchObject({
      manualInstruction: "目标设备未在线，先让 Collector 建立连接并完成一次采集。",
      status: "requires_manual_step",
    });
  });

  it("does not pretend Slock skill synchronization is deterministic before a backend runtime path exists", () => {
    const plan = createAgentMigrationPlan({
      sourceAgentName: "PMO",
      sourceRuntimeKind: "slock",
      targetDeviceOnline: true,
      targetRuntimeKind: "slock",
    });

    expect(plan.status).toBe("requires_manual_step");
    expect(plan.manualInstruction).toContain("Slock");
    expect(plan.steps.find((step) => step.action === "sync_skill")).toMatchObject({
      status: "requires_manual_step",
    });
  });

  it("marks unknown runtimes as unsupported instead of generating a fake install path", () => {
    expect(createAgentMigrationPlan({
      sourceAgentName: "unknown",
      sourceRuntimeKind: "other-runtime",
      targetDeviceOnline: true,
      targetRuntimeKind: "other-runtime",
    })).toMatchObject({
      status: "unsupported",
    });
  });
});
