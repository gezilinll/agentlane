/** Sanitized OpenClaw work-state fixture based on observed task and health shapes. */
export const openClawWorkStateFixture = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: "fixture-device",
  runtimeId: "fixture-device:openclaw:gateway",
  agentId: "fixture-device:openclaw:gateway:agent:main",
  sessions: [
    {
      sessionKey: "fixture-session-1",
      updatedAt: "2026-05-09T07:58:00.000Z",
      status: "active",
    },
  ],
  tasks: [
    {
      taskId: "fixture-task-1",
      runId: "fixture-run-1",
      status: "succeeded",
      createdAt: "2026-05-09T07:50:00.000Z",
      startedAt: "2026-05-09T07:51:00.000Z",
      endedAt: "2026-05-09T07:55:00.000Z",
    },
    {
      taskId: "fixture-task-2",
      runId: "fixture-run-2",
      status: "lost",
      createdAt: "2026-05-09T07:56:00.000Z",
      startedAt: "2026-05-09T07:57:00.000Z",
      endedAt: "2026-05-09T07:59:00.000Z",
      error: "lost heartbeat",
    },
    {
      taskId: "fixture-task-3",
      runId: "fixture-run-3",
      status: "timed_out",
      createdAt: "2026-05-09T07:56:30.000Z",
      startedAt: "2026-05-09T07:57:30.000Z",
      endedAt: "2026-05-09T07:59:30.000Z",
      error: "timeout",
    },
  ],
} as const;

/** Sanitized Multica work-state fixture based on issue and task/run shapes. */
export const multicaWorkStateFixture = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: "fixture-device",
  runtimeId: "fixture-device:multica:runtime-openclaw",
  agentId: "fixture-device:multica:runtime-openclaw:agent:fixture-agent",
  issues: [
    {
      id: "fixture-issue-1",
      identifier: "EX-1",
      title: "Prepare release note",
      status: "todo",
      assignee: "@example-agent",
      creator: "@fixture-human",
      createdAt: "2026-05-09T07:10:00.000Z",
      updatedAt: "2026-05-09T07:40:00.000Z",
    },
    {
      id: "fixture-issue-2",
      identifier: "EX-2",
      title: "Investigate blocked automation",
      status: "blocked",
      assignee: "@example-agent",
      creator: "@fixture-human",
      createdAt: "2026-05-09T07:20:00.000Z",
      updatedAt: "2026-05-09T07:45:00.000Z",
    },
    {
      id: "fixture-issue-3",
      identifier: "EX-3",
      title: "Closed example task",
      status: "done",
      assignee: "@example-agent",
      creator: "@fixture-human",
      createdAt: "2026-05-09T07:30:00.000Z",
      updatedAt: "2026-05-09T07:50:00.000Z",
    },
  ],
  runs: [
    {
      id: "fixture-run-4",
      issueId: "fixture-issue-1",
      status: "running",
      chatSessionId: "fixture-chat-1",
      createdAt: "2026-05-09T07:55:00.000Z",
      startedAt: "2026-05-09T07:56:00.000Z",
    },
  ],
} as const;

/** Sanitized Slock work-state fixture based on task board and history shapes. */
export const slockWorkStateFixture = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: "fixture-device",
  runtimeId: "fixture-device:slock:daemon",
  agentId: "fixture-device:slock:daemon:agent:tester",
  channel: {
    label: "#example-board",
    externalId: "example-board",
  },
  serverAgents: [
    {
      id: "tester",
      active: true,
    },
  ],
  tasks: [
    {
      id: "fixture-slock-task-1",
      taskNumber: 1,
      title: "Example in progress card",
      status: "in_progress",
      createdByName: "@fixture-human",
      claimedByName: "@example-agent",
      createdAt: "2026-05-09T07:10:00.000Z",
      updatedAt: "2026-05-09T07:50:00.000Z",
      messageId: "fixture-message-1",
      threadId: "fixture-thread-1",
    },
    {
      id: "fixture-slock-task-2",
      taskNumber: 2,
      title: "Example review card",
      status: "in_review",
      createdByName: "@fixture-human",
      claimedByName: "@example-agent",
      createdAt: "2026-05-09T07:20:00.000Z",
      updatedAt: "2026-05-09T07:55:00.000Z",
      messageId: "fixture-message-2",
      threadId: "fixture-thread-2",
    },
    {
      id: "fixture-slock-task-3",
      taskNumber: 3,
      title: "Example done card",
      status: "done",
      createdByName: "@fixture-human",
      claimedByName: "@example-agent",
      createdAt: "2026-05-09T07:30:00.000Z",
      updatedAt: "2026-05-09T07:58:00.000Z",
      completedAt: "2026-05-09T07:59:00.000Z",
      messageId: "fixture-message-3",
      threadId: "fixture-thread-3",
    },
  ],
} as const;
