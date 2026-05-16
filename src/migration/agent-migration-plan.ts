/** Runtime capability state used by Agent Migration planning. */
export type AgentMigrationCapabilityState = "supported" | "partial" | "unsupported" | "requires_manual_step";

/** Target runtime operation that Lorume may need during migration. */
export type AgentMigrationAction = "detect_runtime" | "create_agent" | "sync_skill" | "configure_channel" | "verify_agent";

/** Operation status returned by the deterministic migration planner. */
export type AgentMigrationPlanStatus = "ready" | "unsupported" | "requires_manual_step";

/** Runtime-specific migration capability declared by Lorume adapters. */
export interface AgentMigrationCapability {
  createAgent: AgentMigrationCapabilityState;
  detectRuntime: AgentMigrationCapabilityState;
  importAgent: AgentMigrationCapabilityState;
  runtimeKind: string;
  syncSkill: AgentMigrationCapabilityState;
  verifyAgent: AgentMigrationCapabilityState;
  channelNotes: string[];
  limitations: string[];
}

/** One planned migration step. */
export interface AgentMigrationPlanStep {
  action: AgentMigrationAction;
  label: string;
  status: AgentMigrationCapabilityState;
  reason?: string;
}

/** Migration plan generated from current source and target state. */
export interface AgentMigrationPlan {
  capability: AgentMigrationCapability;
  manualInstruction?: string;
  sourceAgentName?: string;
  sourceRuntimeKind: string;
  status: AgentMigrationPlanStatus;
  steps: AgentMigrationPlanStep[];
  targetRuntimeKind: string;
}

/** Input used to generate a current, non-persistent Agent migration plan. */
export interface CreateAgentMigrationPlanInput {
  desiredChannels?: string[];
  sourceAgentName?: string;
  sourceRuntimeKind: string;
  targetDeviceOnline: boolean;
  targetRuntimeDetected?: boolean;
  targetRuntimeKind?: string | null;
}

/** Return the current migration capability for a runtime kind. */
export function describeMigrationCapability(runtimeKind: string): AgentMigrationCapability {
  const normalizedKind = normalizeRuntimeKind(runtimeKind);
  if (normalizedKind === "openclaw") {
    return {
      channelNotes: ["DingTalk 已支持；Telegram、Slack 等渠道仅在运行态识别到后展示，不由迁移自动创建外部绑定。"],
      createAgent: "supported",
      detectRuntime: "supported",
      importAgent: "supported",
      limitations: ["不迁移历史会话、外部平台 token 或登录态。"],
      runtimeKind: normalizedKind,
      syncSkill: "supported",
      verifyAgent: "supported",
    };
  }
  if (normalizedKind === "multica") {
    return {
      channelNotes: ["Multica 是 runtime / platform source，不作为 Lorume Channel。"],
      createAgent: "supported",
      detectRuntime: "supported",
      importAgent: "supported",
      limitations: ["不迁移 Multica 平台私有登录态。"],
      runtimeKind: normalizedKind,
      syncSkill: "supported",
      verifyAgent: "supported",
    };
  }
  if (normalizedKind === "slock") {
    return {
      channelNotes: ["Slock 是 runtime / platform source，不作为 Lorume Channel。"],
      createAgent: "partial",
      detectRuntime: "supported",
      importAgent: "partial",
      limitations: ["Slock Skill 同步需要先确认 agent 背后的确定性 runtime skill 路径。"],
      runtimeKind: normalizedKind,
      syncSkill: "requires_manual_step",
      verifyAgent: "partial",
    };
  }
  if (normalizedKind === "codex") {
    return {
      channelNotes: ["Codex 没有 Lorume 当前可确定调用的外部 Channel。"],
      createAgent: "requires_manual_step",
      detectRuntime: "supported",
      importAgent: "requires_manual_step",
      limitations: ["Codex 当前没有稳定的 Agent 创建配置模型；Skill 目录同步可以通过 Skill Management 处理。"],
      runtimeKind: normalizedKind,
      syncSkill: "supported",
      verifyAgent: "requires_manual_step",
    };
  }
  return {
    channelNotes: [],
    createAgent: "unsupported",
    detectRuntime: "unsupported",
    importAgent: "unsupported",
    limitations: ["未知 runtime 没有已知迁移 recipe。"],
    runtimeKind: normalizedKind,
    syncSkill: "unsupported",
    verifyAgent: "unsupported",
  };
}

/** Build a deterministic plan from current device and runtime state. */
export function createAgentMigrationPlan(input: CreateAgentMigrationPlanInput): AgentMigrationPlan {
  const targetRuntimeKind = normalizeRuntimeKind(input.targetRuntimeKind ?? input.sourceRuntimeKind);
  const capability = describeMigrationCapability(targetRuntimeKind);
  const targetRuntimeDetected = input.targetRuntimeDetected ?? true;
  const steps = createPlanSteps(capability, input.desiredChannels ?? [], targetRuntimeDetected);
  const unsupportedStep = steps.find((step) => step.status === "unsupported");
  const manualStep = steps.find((step) => step.status === "requires_manual_step");

  if (!input.targetDeviceOnline) {
    return {
      capability,
      manualInstruction: "目标设备未在线，先让 Collector 建立连接并完成一次采集。",
      sourceAgentName: input.sourceAgentName,
      sourceRuntimeKind: normalizeRuntimeKind(input.sourceRuntimeKind),
      status: "requires_manual_step",
      steps,
      targetRuntimeKind,
    };
  }

  if (unsupportedStep) {
    return {
      capability,
      manualInstruction: unsupportedStep.reason ?? `${targetRuntimeKind} 暂无已知迁移 recipe。`,
      sourceAgentName: input.sourceAgentName,
      sourceRuntimeKind: normalizeRuntimeKind(input.sourceRuntimeKind),
      status: "unsupported",
      steps,
      targetRuntimeKind,
    };
  }

  if (manualStep) {
    return {
      capability,
      manualInstruction: manualStep.reason ?? `${targetRuntimeKind} 需要手动补齐后才能继续迁移。`,
      sourceAgentName: input.sourceAgentName,
      sourceRuntimeKind: normalizeRuntimeKind(input.sourceRuntimeKind),
      status: "requires_manual_step",
      steps,
      targetRuntimeKind,
    };
  }

  return {
    capability,
    sourceAgentName: input.sourceAgentName,
    sourceRuntimeKind: normalizeRuntimeKind(input.sourceRuntimeKind),
    status: "ready",
    steps,
    targetRuntimeKind,
  };
}

function createPlanSteps(
  capability: AgentMigrationCapability,
  desiredChannels: string[],
  targetRuntimeDetected: boolean,
): AgentMigrationPlanStep[] {
  return [
    {
      action: "detect_runtime",
      label: "检测目标 Runtime",
      status: targetRuntimeDetected ? capability.detectRuntime : "requires_manual_step",
      reason: targetRuntimeDetected
        ? reasonFor(capability.runtimeKind, "detect_runtime", capability.detectRuntime)
        : `目标设备尚未识别到 ${capability.runtimeKind} Runtime，先安装或启动该 Runtime，并等待 Collector 完成一次采集。`,
    },
    {
      action: "create_agent",
      label: "创建或导入 Agent",
      status: capability.importAgent,
      reason: reasonFor(capability.runtimeKind, "create_agent", capability.importAgent),
    },
    {
      action: "sync_skill",
      label: "同步 Skill 分配",
      status: capability.syncSkill,
      reason: reasonFor(capability.runtimeKind, "sync_skill", capability.syncSkill),
    },
    ...channelSteps(capability, desiredChannels),
    {
      action: "verify_agent",
      label: "校验目标 Agent",
      status: capability.verifyAgent,
      reason: reasonFor(capability.runtimeKind, "verify_agent", capability.verifyAgent),
    },
  ];
}

function channelSteps(
  capability: AgentMigrationCapability,
  desiredChannels: string[],
): AgentMigrationPlanStep[] {
  return desiredChannels.map((channel) => ({
    action: "configure_channel" as const,
    label: `恢复 Channel：${channel}`,
    reason: channel.toLowerCase() === "dingtalk" && capability.runtimeKind === "openclaw"
      ? undefined
      : "外部 Channel 绑定不由迁移流程自动创建，只展示已识别关联。",
    status: channel.toLowerCase() === "dingtalk" && capability.runtimeKind === "openclaw" ? "partial" : "requires_manual_step",
  }));
}

function reasonFor(
  runtimeKind: string,
  action: AgentMigrationAction,
  status: AgentMigrationCapabilityState,
): string | undefined {
  if (status === "supported") return undefined;
  if (runtimeKind === "slock" && action === "sync_skill") {
    return "Slock 需要先确认 agent 背后的确定性 runtime skill 路径，不能直接写 .slock 作为默认迁移策略。";
  }
  if (runtimeKind === "codex" && (action === "create_agent" || action === "verify_agent")) {
    return "Codex 当前没有稳定的 Agent 创建配置模型，需要人工补齐目标 Agent 配置。";
  }
  if (status === "unsupported") return `${runtimeKind} 暂无已知 ${action} recipe。`;
  if (status === "requires_manual_step") return `${runtimeKind} 的 ${action} 需要人工补齐。`;
  return `${runtimeKind} 的 ${action} 只能部分自动化，执行前需要用户确认限制。`;
}

function normalizeRuntimeKind(runtimeKind: string): string {
  const normalized = runtimeKind.trim().toLowerCase().replace(/[\s_-]+/g, "-");
  if (normalized === "open-claw") return "openclaw";
  if (normalized === "claude-code") return "claude_code";
  return normalized || "unknown";
}
