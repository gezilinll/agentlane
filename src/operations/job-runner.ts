import type { OperationJobRow, OperationJobType, OperationStore } from "./operation-store";

/** Handler result for a claimed operation job. */
export interface OperationJobHandlerResult {
  status: "succeeded" | "unsupported";
}

/** Handler for one executable operation job type. */
export type OperationJobHandler = (job: OperationJobRow) => Promise<OperationJobHandlerResult> | OperationJobHandlerResult;

/** Operation job runner options. */
export interface OperationJobRunnerOptions {
  operationStore: OperationStore;
  handlers: Partial<Record<OperationJobType, OperationJobHandler>>;
  runnerId: string;
  leaseMs?: number;
  retryAfterMs?: number;
  now?: () => Date;
}

/** Result of one runner tick. */
export type OperationJobRunResult =
  | { status: "idle" }
  | { status: "handled"; jobId: string; jobType: OperationJobType; outcome: "succeeded" | "unsupported" }
  | { status: "failed"; jobId: string; jobType: OperationJobType; errorSummary: string };

/** Minimal Postgres-backed job runner. */
export interface OperationJobRunner {
  runDueJobOnce: () => Promise<OperationJobRunResult>;
}

/** Create a single-process job runner over OperationStore claim/lease semantics. */
export function createOperationJobRunner(options: OperationJobRunnerOptions): OperationJobRunner {
  const leaseMs = options.leaseMs ?? 60_000;
  const retryAfterMs = options.retryAfterMs ?? 30_000;
  const now = options.now ?? (() => new Date());

  return {
    async runDueJobOnce() {
      const claimedJob = await options.operationStore.claimNextJob({
        leaseMs,
        now: now(),
        runnerId: options.runnerId,
      });
      if (!claimedJob) return { status: "idle" };

      const handler = options.handlers[claimedJob.type];
      if (!handler) {
        await options.operationStore.completeJob({
          jobId: claimedJob.id,
          now: now(),
          status: "unsupported",
        });
        return {
          jobId: claimedJob.id,
          jobType: claimedJob.type,
          outcome: "unsupported",
          status: "handled",
        };
      }

      try {
        const result = await handler(claimedJob);
        await options.operationStore.completeJob({
          jobId: claimedJob.id,
          now: now(),
          status: result.status,
        });
        return {
          jobId: claimedJob.id,
          jobType: claimedJob.type,
          outcome: result.status,
          status: "handled",
        };
      } catch (error) {
        const errorSummary = normalizeErrorSummary(error);
        await options.operationStore.failJob({
          errorSummary,
          jobId: claimedJob.id,
          now: now(),
          retryAfterMs,
        });
        return {
          errorSummary,
          jobId: claimedJob.id,
          jobType: claimedJob.type,
          status: "failed",
        };
      }
    },
  };
}

function normalizeErrorSummary(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 500);
  return "operation job failed";
}
