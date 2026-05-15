import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resetE2eDatabase } from "./db";

const userEmail = "skill-auth-e2e@lorume.local";
const loginCodePath = path.resolve(
  process.cwd(),
  process.env.LORUME_E2E_LOGIN_CODE_PATH ?? ".lorume/e2e/latest-login-code-auth.json",
);

test.beforeEach(async () => {
  await resetE2eDatabase();
});

test("imports a Skill through the authenticated organization console", async ({ page }) => {
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "登录 Lorume" })).toBeVisible();

  await page.getByLabel("邮箱").fill(userEmail);
  await page.getByRole("button", { name: /发送验证码/ }).click();

  const code = await readLatestLoginCode(userEmail);
  await expect(page.getByRole("heading", { name: "输入验证码" })).toBeVisible();
  await page.getByLabel("验证码").fill(code);
  await page.getByRole("button", { name: "进入控制台" }).click();

  await expect(page.getByRole("heading", { name: "创建组织" })).toBeVisible();
  await page.getByLabel("组织名称").fill("Lorume E2E Team");
  await page.getByRole("button", { name: "创建并进入" }).click();

  await expect(page.getByRole("heading", { name: "Skill Registry" })).toBeVisible();
  await page.getByLabel("Skill 内容").fill(`---
name: Browser Auth Skill
description: Skill imported by the authenticated browser harness.
license: MIT
compatibility: lorume
---

# Browser Auth Skill

Use this test Skill to prove the protected Skill Registry can import through the real backend.
`);
  await page.getByRole("button", { name: "导入 Skill" }).click();

  await expect(page.getByText("Browser Auth Skill 已导入。")).toBeVisible();
  await expect(page.getByRole("button", { name: /Browser Auth Skill/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browser Auth Skill" })).toBeVisible();

  await page.getByRole("button", { name: "发布最新版本" }).click();
  await expect(page.getByText("发布任务已排队。")).toBeVisible();
  await expect(page.getByText(/发布 Skill：Browser Auth Skill/)).toBeVisible();
});

async function readLatestLoginCode(email: string): Promise<string> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 8_000) {
    try {
      const payload = JSON.parse(readFileSync(loginCodePath, "utf8")) as {
        code?: unknown;
        email?: unknown;
      };
      if (payload.email === email && typeof payload.code === "string") {
        return payload.code;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Login code for ${email} was not written to ${loginCodePath}: ${String(lastError)}`);
}
