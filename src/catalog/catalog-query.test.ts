import { describe, expect, it } from "vitest";
import { catalogSeedObjects } from "./catalog-seed";
import { filterCatalogObjects } from "./catalog-query";

describe("filterCatalogObjects", () => {
  it("matches keyword against name, purpose, and tags", () => {
    const results = filterCatalogObjects(catalogSeedObjects, { query: "成本" });

    expect(results.map((object) => object.name)).toContain("成本守护策略");
  });

  it("filters by object type", () => {
    const results = filterCatalogObjects(catalogSeedObjects, { type: "domain_agent" });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("业务指标 Agent");
  });

  it("filters by lifecycle", () => {
    const results = filterCatalogObjects(catalogSeedObjects, { lifecycle: "production" });

    expect(results.map((object) => object.name)).toEqual(
      expect.arrayContaining(["Aetheris CLI", "BI 指标数据源"]),
    );
  });

  it("filters by owner status", () => {
    const results = filterCatalogObjects(catalogSeedObjects, { owner: "tbd" });

    expect(results.every((object) => object.ownerSlot.status === "tbd")).toBe(true);
    expect(results.map((object) => object.name)).toEqual(
      expect.arrayContaining(["aetheris-link-inspect", "决策记忆", "成本守护策略"]),
    );
  });

  it("combines query, type, lifecycle, and owner filters", () => {
    const results = filterCatalogObjects(catalogSeedObjects, {
      query: "成本",
      type: "policy",
      lifecycle: "review",
      owner: "tbd",
    });

    expect(results.map((object) => object.name)).toEqual(["成本守护策略"]);
  });
});

