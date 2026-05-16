import type {
  SkillAssignmentRow,
  SkillAssignmentStatus,
  SkillAssignmentTargetType,
} from "./skill-governance-store";

/** Target reference used to resolve explicit Skill assignments. */
export interface SkillAssignmentTargetRef {
  /** Target layer. */
  targetType: SkillAssignmentTargetType;
  /** Target id at that layer. */
  targetId: string;
}

/** Target Skill installation state after assignment resolution. */
export type TargetSkillResolutionState =
  | "pending_sync"
  | "syncing"
  | "installed"
  | "failed"
  | "unsupported";

/** A Skill assignment that applies to a concrete target after hierarchy resolution. */
export interface ResolvedTargetSkillAssignment extends SkillAssignmentRow {
  /** Zero-based specificity in the provided target lineage; larger means closer to the target. */
  specificity: number;
  /** User-facing target Skill installation state. */
  resolutionState: TargetSkillResolutionState;
  /** Assignment ids hidden by this closer target assignment. */
  overriddenAssignmentIds: string[];
}

/** Input for resolving the Skill set that a concrete target should use. */
export interface ResolveTargetSkillAssignmentsInput {
  /** Explicit assignments from the organization. Organization assets without assignments are intentionally absent. */
  assignments: SkillAssignmentRow[];
  /** Target ancestry from broadest to most specific, for example Device -> Runtime -> Agent. */
  targetLineage: SkillAssignmentTargetRef[];
}

/** Resolve explicit Device/Runtime/Agent assignments into a concrete target Skill set. */
export function resolveTargetSkillAssignments(
  input: ResolveTargetSkillAssignmentsInput,
): ResolvedTargetSkillAssignment[] {
  const specificityByTargetKey = new Map(
    input.targetLineage.map((target, index) => [targetKey(target.targetType, target.targetId), index]),
  );
  const candidates = input.assignments
    .map((assignment) => {
      const specificity = specificityByTargetKey.get(targetKey(assignment.targetType, assignment.targetId));
      if (specificity === undefined) return null;
      if (assignment.status === "disabled" || assignment.status === "pending_review") return null;
      return {
        ...assignment,
        specificity,
        resolutionState: resolutionStateForAssignmentStatus(assignment.status),
        overriddenAssignmentIds: [],
      };
    })
    .filter((assignment): assignment is ResolvedTargetSkillAssignment => assignment !== null);

  const bySkillId = new Map<string, ResolvedTargetSkillAssignment>();
  for (const candidate of candidates) {
    const previous = bySkillId.get(candidate.skillId);
    if (!previous || candidate.specificity > previous.specificity) {
      bySkillId.set(candidate.skillId, {
        ...candidate,
        overriddenAssignmentIds: previous ? [previous.id, ...previous.overriddenAssignmentIds] : [],
      });
      continue;
    }
    if (previous.specificity > candidate.specificity) {
      previous.overriddenAssignmentIds.push(candidate.id);
    }
  }

  return [...bySkillId.values()].sort((left, right) => {
    if (left.specificity !== right.specificity) return left.specificity - right.specificity;
    return left.skillId.localeCompare(right.skillId);
  });
}

/** Map assignment lifecycle state to target Skill installation state. */
export function resolutionStateForAssignmentStatus(status: SkillAssignmentStatus): TargetSkillResolutionState {
  if (status === "approved") return "pending_sync";
  if (status === "syncing") return "syncing";
  if (status === "synced") return "installed";
  if (status === "failed") return "failed";
  return "unsupported";
}

function targetKey(targetType: SkillAssignmentTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}
