import { describe, it, expect } from "vitest";
import { setupE2E, getLocalStorageItem } from "./fixtures.js";

const ctx = setupE2E();

async function bodyBg(page: import("playwright").Page): Promise<string> {
  return await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor,
  );
}

describe("Palette picker (e2e, real server)", () => {
  it("selects a palette, persists across reload, and coexists with dark mode", async () => {
    const { page, testServer } = ctx;
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="palette-picker-trigger"]', {
      state: "visible", timeout: 15000,
    });

    const defaultBg = await bodyBg(page);

    await page.click('[data-testid="palette-picker-trigger"]');
    await page.click('[data-testid="palette-picker-item-dracula"]');

    await page.waitForFunction(
      () => document.documentElement.dataset.palette === "dracula",
      undefined, { timeout: 5000 },
    );
    expect(await getLocalStorageItem(page, "palette")).toBe("dracula");

    const draculaBg = await bodyBg(page);
    expect(draculaBg).not.toBe(defaultBg);

    await page.reload();
    await page.waitForSelector('[data-testid="palette-picker-trigger"]', {
      state: "visible", timeout: 15000,
    });
    expect(
      await page.evaluate(() => document.documentElement.dataset.palette),
    ).toBe("dracula");

    await page.click('[data-testid="theme-toggle-button"]');
    await page.waitForFunction(
      () => document.documentElement.classList.contains("dark"),
      undefined, { timeout: 5000 },
    );
    expect(
      await page.evaluate(() => document.documentElement.dataset.palette),
    ).toBe("dracula");
    expect(
      await page.evaluate(() => document.documentElement.classList.contains("dark")),
    ).toBe(true);

    const draculaDarkBg = await bodyBg(page);
    expect(draculaDarkBg).not.toBe(draculaBg);
  }, 60000);
});
