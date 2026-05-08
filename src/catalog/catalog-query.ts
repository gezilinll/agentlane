import type { CatalogLifecycle, CatalogObject, CatalogObjectType } from "./catalog-object";

export type CatalogOwnerFilter = "all" | "tbd" | "assigned";

export interface CatalogFilterCriteria {
  query?: string;
  type?: CatalogObjectType | "all";
  lifecycle?: CatalogLifecycle | "all";
  owner?: CatalogOwnerFilter;
}

export function filterCatalogObjects(
  objects: CatalogObject[],
  criteria: CatalogFilterCriteria,
): CatalogObject[] {
  const query = normalize(criteria.query ?? "");

  return objects.filter((object) => {
    const matchesQuery =
      !query ||
      [
        object.name,
        object.purpose,
        object.description ?? "",
        object.type,
        object.lifecycle,
        ...object.tags,
      ].some((value) => normalize(value).includes(query));

    const matchesType =
      !criteria.type || criteria.type === "all" || object.type === criteria.type;

    const matchesLifecycle =
      !criteria.lifecycle ||
      criteria.lifecycle === "all" ||
      object.lifecycle === criteria.lifecycle;

    const owner = criteria.owner ?? "all";
    const matchesOwner = owner === "all" || object.ownerSlot.status === owner;

    return matchesQuery && matchesType && matchesLifecycle && matchesOwner;
  });
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

