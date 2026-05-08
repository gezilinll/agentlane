/**
 * Catalog object types that the first Catalog page can list and open.
 *
 * Keep this set intentionally small. Add new object types only when the
 * product needs to treat them as first-class Catalog objects.
 */
export const CATALOG_OBJECT_TYPES = [
  /** Repeatable business process with fixed trigger, steps, outputs, and recipients. */
  "workflow",
  /** Domain judgment subject that owns definitions, attribution, explanation, and recommendations. */
  "domain_agent",
  /** Reusable capability package such as instructions, scripts, tests, and tool usage rules. */
  "skill",
  /** Runtime device or process that executes queued work. */
  "worker",
  /** Executable integration or lower-level capability used by agents, workflows, or skills. */
  "tool",
  /** Data or knowledge source that provides facts, metrics, logs, issues, or requirements. */
  "data_source",
  /** Managed memory scope such as role, preference, project, or decision memory. */
  "memory",
  /** Governance rule for permission, approval, budget, security, or automation boundary. */
  "policy",
] as const;

/** First-class Catalog object type. */
export type CatalogObjectType = (typeof CATALOG_OBJECT_TYPES)[number];

/**
 * Shared lifecycle states for formal Catalog objects.
 *
 * "Retire" and "Replace" from the product docs are modeled as terminal states.
 */
export const CATALOG_LIFECYCLES = [
  /** Object is being drafted and is not ready for formal review. */
  "draft",
  /** Object is waiting for human review or approval. */
  "review",
  /** Object is being tried in a limited production-like scope. */
  "pilot",
  /** Object is available for normal production use. */
  "production",
  /** Object is in production and under active quality, risk, and usage monitoring. */
  "monitor",
  /** Object has been intentionally taken out of use. */
  "retired",
  /** Object has been superseded by another object. */
  "replaced",
] as const;

/** Lifecycle state for a formal Catalog object. */
export type CatalogLifecycle = (typeof CATALOG_LIFECYCLES)[number];

/** Owner slot for a Catalog object. The slot must exist even before assignment. */
export type CatalogOwnerSlot =
  | {
      /** Owner assignment state. */
      status: "tbd";
      /** Optional visible label for an unassigned owner slot. */
      label?: string;
    }
  | {
      /** Owner assignment state. */
      status: "assigned";
      /** Human-readable owner name. */
      name: string;
      /** Optional team or group for the owner. */
      team?: string;
      /** Optional contact handle, email, or channel. */
      contact?: string;
    };

/** Lightweight reference to another Catalog object. */
export interface CatalogObjectRef {
  /** Stable object id. */
  id: string;
  /** Referenced object type. */
  type: CatalogObjectType;
  /** Human-readable referenced object name. */
  name: string;
}

/** Minimal first-pass shape for a Catalog object. */
export interface CatalogObject {
  /** Stable object id. */
  id: string;
  /** First-class Catalog object type. */
  type: CatalogObjectType;
  /** Human-readable object name. */
  name: string;
  /** URL-safe or lookup-safe object identifier. */
  slug: string;
  /** Short statement of why this object exists. */
  purpose: string;
  /** Required owner slot, even when the owner is still TBD. */
  ownerSlot: CatalogOwnerSlot;
  /** Human-readable input contract summaries. */
  inputs: string[];
  /** Human-readable output contract summaries. */
  outputs: string[];
  /** Human-readable trigger summary. Keep string-based until UI/backend needs structure. */
  trigger: string;
  /** Human-readable permission or policy summary. Keep string-based until governance needs structure. */
  permission: string;
  /** Human-readable eval or acceptance summary. Keep string-based until eval harness needs structure. */
  eval: string;
  /** Current lifecycle state. */
  lifecycle: CatalogLifecycle;
  /** Search and grouping tags. */
  tags: string[];
  /** Objects this object depends on or calls. */
  dependencies: CatalogObjectRef[];
  /** Objects that depend on or call this object. */
  usedBy: CatalogObjectRef[];
  /** Optional longer description for detail views. */
  description?: string;
}

/** Reusable default owner slot for objects whose owner is not assigned yet. */
export const TBD_OWNER_SLOT: CatalogOwnerSlot = {
  /** Owner assignment state. */
  status: "tbd",
  /** Visible label for unassigned owner slots. */
  label: "TBD",
};
