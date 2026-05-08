import { expect, test } from "@playwright/test";

test.describe("Catalog responsive layout", () => {
  test("fills the available workspace on wide desktop screens", async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1058 });
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing layout element: ${selector}`);
        }

        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      };

      const workspace = box(".workspace");
      const toolbar = box(".toolbar");
      const metricGrid = box(".metricGrid");
      const contentGrid = box(".contentGrid");

      return {
        contentRightGap: workspace.right - contentGrid.right,
        metricContentRightDelta: Math.abs(metricGrid.right - contentGrid.right),
        toolbarContentRightDelta: Math.abs(toolbar.right - contentGrid.right),
        toolbarWidth: toolbar.width,
      };
    });

    expect(layout.contentRightGap).toBeLessThanOrEqual(24);
    expect(layout.toolbarContentRightDelta).toBeLessThanOrEqual(1);
    expect(layout.metricContentRightDelta).toBeLessThanOrEqual(1);
    expect(layout.toolbarWidth).toBeGreaterThan(1600);
  });

  test("aligns toolbar controls below visible filter labels", async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1058 });
    await page.goto("/");

    await expect(page.getByText("搜索", { exact: true })).toBeVisible();
    await expect(page.getByText("Owner 状态", { exact: true })).toBeVisible();

    const controlTops = await page.evaluate(() => {
      const top = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing toolbar control: ${selector}`);
        }

        return element.getBoundingClientRect().top;
      };

      return [
        top(".searchBox"),
        top("[data-testid='type-filter']"),
        top("[data-testid='lifecycle-filter']"),
        top(".segmentedControl"),
      ];
    });

    expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(1);
  });

  test("keeps the mobile page within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "对象目录" })).toBeVisible();
    await expect(page.getByPlaceholder("搜索名称、用途或标签")).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );

    expect(pageOverflows).toBe(false);
  });
});
