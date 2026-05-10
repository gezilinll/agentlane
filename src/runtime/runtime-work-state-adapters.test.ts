import { describe, expect, it } from "vitest";
import {
  mapMulticaWorkState,
  mapOpenClawWorkState,
  mapSlockWorkState,
} from "./runtime-work-state-adapters";
import {
  multicaWorkStateFixture,
  openClawWorkStateFixture,
  slockWorkStateFixture,
} from "./runtime-work-state-fixtures";

describe("runtime work state adapters", () => {
  it("maps OpenClaw DingTalk messages into readable work items linked to executions", () => {
    const result = mapOpenClawWorkState(openClawWorkStateFixture);

    expect(result.workItems).toContainEqual(expect.objectContaining({
      source: "openclaw",
      title: "帮我检查今天的线上异常",
      status: "done",
      creator: { kind: "human", label: "张三", externalId: "user-1" },
      channel: { kind: "dingtalk", label: "研发值班群", externalId: "group-1" },
      conversationId: "fixture-device:openclaw:gateway:conversation:agent-main-dingtalk-group-group-1",
    }));
    expect(result.workItems[0]?.description).toBe("帮我检查今天的线上异常，给出结论和下一步建议");
    expect(result.executions.map((item) => item.status)).toContain("succeeded");
    expect(result.executions.map((item) => item.status)).toContain("failed");
    expect(result.executions[0]).toMatchObject({
      workItemId: result.workItems[0]?.id,
      conversationId: result.workItems[0]?.conversationId,
    });
    expect(result.conversations[0]).toMatchObject({
      source: "openclaw",
      status: "active",
      title: "研发值班群",
      agentId: "fixture-device:openclaw:gateway:agent:main",
    });
    expect(result.capabilities[0]).toMatchObject({
      source: "openclaw",
      workItems: { support: "partial" },
      conversations: { support: "partial" },
      executions: { support: "supported" },
    });
  });

  it("maps OpenClaw DingTalk task sessions into work items when message context is empty", () => {
    const result = mapOpenClawWorkState({
      ...openClawWorkStateFixture,
      dingtalkTargets: [{
        conversationId: "Group-1",
        kind: "group",
        label: "研发值班群",
        lastSeenAt: "2026-05-09T07:58:00.000Z",
      }],
      dingtalkMessages: [],
      tasks: [
        {
          taskId: "origin-task-1",
          runId: "origin-run-1",
          task: "请在当前钉钉群上下文中检查 ai-toolkit 定时放量任务，给出处理结论",
          status: "succeeded",
          requesterSessionKey: "agent:main:dingtalk:group:group-1",
          sourceId: "source-message-1",
          createdAt: "2026-05-09T07:50:00.000Z",
          startedAt: "2026-05-09T07:51:00.000Z",
          endedAt: "2026-05-09T07:55:00.000Z",
        },
        {
          taskId: "approval-followup-1",
          task: "[Fri May 09 2026] An async command the user already approved has completed.",
          status: "succeeded",
          requesterOriginJson: JSON.stringify({ channel: "dingtalk", to: "group-1" }),
          sourceId: "exec-approval-followup:origin-task-1",
        },
        {
          taskId: "system-recovery-1",
          task: "[Wed 2026-05-06 17:39 GMT+8] [System] Your previous turn was interrupted by a gateway restart.",
          status: "cancelled",
          requesterSessionKey: "agent:main:dingtalk:group:group-1",
          sourceId: "system-recovery",
        },
      ],
    });

    expect(result.workItems).toHaveLength(1);
    expect(result.workItems[0]).toMatchObject({
      source: "openclaw",
      externalId: "origin-task-1",
      title: "请在当前钉钉群上下文中检查 ai-toolkit 定时放量任务",
      description: "请在当前钉钉群上下文中检查 ai-toolkit 定时放量任务，给出处理结论",
      status: "done",
      creator: { kind: "unknown", label: "不支持采集", externalId: "source-message-1" },
      channel: { kind: "dingtalk", label: "研发值班群", externalId: "group-1" },
      conversationId: "fixture-device:openclaw:gateway:conversation:agent-main-dingtalk-group-group-1",
    });
    expect(result.executions).toContainEqual(expect.objectContaining({
      source: "openclaw",
      externalId: "origin-run-1",
      workItemId: result.workItems[0]?.id,
      conversationId: result.workItems[0]?.conversationId,
      status: "succeeded",
    }));
    expect(result.workItems.map((item) => item.externalId)).not.toContain("approval-followup-1");
    expect(result.workItems.map((item) => item.externalId)).not.toContain("system-recovery-1");
  });

  it("maps OpenClaw DingTalk direct session ids to readable channel labels", () => {
    const result = mapOpenClawWorkState({
      ...openClawWorkStateFixture,
      dingtalkTargets: [{
        conversationId: "0403085742945013",
        kind: "direct",
        label: "0403085742945013",
        lastSeenAt: "2026-05-09T07:58:00.000Z",
      }],
      dingtalkMessages: [],
      tasks: [
        {
          taskId: "direct-task-1",
          runId: "direct-run-1",
          task: "帮我检查私聊里的 Agent 回复",
          status: "succeeded",
          requesterSessionKey: "agent:main:dingtalk:direct:0403085742945013",
          sourceId: "direct-source-1",
          createdAt: "2026-05-09T07:50:00.000Z",
          startedAt: "2026-05-09T07:51:00.000Z",
          endedAt: "2026-05-09T07:55:00.000Z",
        },
      ],
      trajectoryRuns: [],
    });

    expect(result.workItems[0]).toMatchObject({
      source: "openclaw",
      channel: {
        kind: "dingtalk",
        label: "DingTalk 私聊 040308...5013",
        externalId: "0403085742945013",
      },
    });
    const conversation = result.conversations.find((item) => item.externalId === "agent:main:dingtalk:direct:0403085742945013");
    expect(conversation).toMatchObject({
      title: "DingTalk 私聊 040308...5013",
      channel: {
        kind: "dingtalk",
        label: "DingTalk 私聊 040308...5013",
      },
    });
  });

  it("maps OpenClaw DingTalk trajectory runs into work items when durable task data is absent", () => {
    const result = mapOpenClawWorkState({
      ...openClawWorkStateFixture,
      dingtalkMessages: [],
      tasks: [],
      trajectoryRuns: [
        {
          runId: "trajectory-run-1",
          sessionKey: "agent:main:dingtalk:group:group-1",
          prompt: "请总结昨天的告警，并给出后续动作",
          finalStatus: "success",
          endedStatus: "success",
          assistantTexts: ["已完成"],
          startedAt: "2026-05-09T08:01:00.000Z",
          endedAt: "2026-05-09T08:02:00.000Z",
        },
        {
          runId: "trajectory-run-2",
          sessionKey: "agent:main:dingtalk:group:group-1",
          prompt: "[OpenClaw heartbeat poll]",
          finalStatus: "success",
          endedStatus: "success",
          assistantTexts: ["HEARTBEAT_OK"],
          startedAt: "2026-05-09T08:03:00.000Z",
          endedAt: "2026-05-09T08:03:05.000Z",
        },
        {
          runId: "trajectory-run-3",
          sessionKey: "agent:main:dingtalk:group:group-1",
          prompt: "[Fri May 09 2026] An async command the user already approved has completed.",
          finalStatus: "success",
          endedStatus: "success",
          assistantTexts: ["done"],
          startedAt: "2026-05-09T08:04:00.000Z",
          endedAt: "2026-05-09T08:04:05.000Z",
        },
        {
          runId: "trajectory-run-4",
          sessionKey: "agent:main:dingtalk:group:group-1",
          prompt: "为什么昨晚任务没有回复",
          finalStatus: "error",
          endedStatus: "error",
          assistantTexts: [],
          startedAt: "2026-05-09T08:05:00.000Z",
          endedAt: "2026-05-09T08:06:00.000Z",
        },
      ],
    });

    expect(result.workItems.map((item) => item.externalId)).toEqual([
      "trajectory-run-1",
      "trajectory-run-4",
    ]);
    expect(result.workItems[0]).toMatchObject({
      source: "openclaw",
      title: "请总结昨天的告警",
      description: "请总结昨天的告警，并给出后续动作",
      status: "done",
      channel: { kind: "dingtalk", label: "研发值班群", externalId: "group-1" },
      creator: { kind: "unknown", label: "不支持采集" },
    });
    expect(result.workItems[1]).toMatchObject({
      source: "openclaw",
      title: "为什么昨晚任务没有回复",
      status: "blocked",
    });
    expect(result.executions).toContainEqual(expect.objectContaining({
      source: "openclaw",
      externalId: "trajectory-run-1",
      status: "succeeded",
      workItemId: "fixture-device:openclaw:gateway:work-item:trajectory-run-1",
    }));
    expect(result.executions).toContainEqual(expect.objectContaining({
      source: "openclaw",
      externalId: "trajectory-run-4",
      status: "failed",
      workItemId: "fixture-device:openclaw:gateway:work-item:trajectory-run-4",
    }));
  });

  it("maps Multica issues and runs into work items and executions", () => {
    const result = mapMulticaWorkState(multicaWorkStateFixture);

    expect(result.workItems.map((item) => item.status)).toContain("todo");
    expect(result.workItems.map((item) => item.status)).toContain("blocked");
    expect(result.executions.map((item) => item.status)).toContain("running");
    expect(result.capabilities[0]).toMatchObject({
      source: "multica",
      workItems: { support: "supported" },
      executions: { support: "supported" },
    });
  });

  it("maps Slock task board and activity evidence without treating server active as execution running", () => {
    const result = mapSlockWorkState(slockWorkStateFixture);

    expect(result.workItems.map((item) => item.status)).toContain("in_review");
    expect(result.workItems.map((item) => item.status)).toContain("in_progress");
    expect(result.executions).toContainEqual(expect.objectContaining({
      source: "slock",
      status: "running",
      workItemId: "fixture-device:slock:daemon:work-item:fixture-slock-task-1",
      conversationId: "fixture-device:slock:daemon:conversation:fixture-thread-1",
    }));
    expect(result.capabilities[0]).toMatchObject({
      source: "slock",
      executions: { support: "partial" },
    });
  });
});
