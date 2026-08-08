import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { setupE2E } from "./fixtures.js";
import { createScratchRepo } from "./git-fixtures.js";
import { rmTemp } from "./real-server.js";

// The server migrates config.json when it boots, so the legacy shape has to be
// on disk before the fixture starts it.
const repoDir = createScratchRepo("cl-e2e-repo-");

describe("Legacy config with 'slug' property names (sandboxed e2e)", () => {
  const ctx = setupE2E({
    serverOpts: {
      seedDataDir: (dataDir) => {
        const configDir = path.join(dataDir, "config");
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
          path.join(configDir, "config.json"),
          JSON.stringify({
            projects: [{ path: repoDir, slug: "legacy-proj", branch: "tickets" }],
            lastUsedSlug: "legacy-proj",
          }),
        );
      },
    },
  });

  afterAll(async () => {
    await rmTemp(repoDir, "legacy-config repoDir");
  });

  async function gotoLoadedHome(): Promise<void> {
    await ctx.page.goto(ctx.testServer.baseUrl);
    await ctx.page.locator('button[title="Settings"]')
      .waitFor({ state: "visible", timeout: 15000 });
  }

  it("navigates past loading screen when config uses old 'slug' property names", async () => {
    await gotoLoadedHome();
    expect(await ctx.page.locator("p").filter({ hasText: "Loading..." }).count()).toBe(0);
  });

  it("migrates config file to use projectSlug property names", async () => {
    await gotoLoadedHome();
    const config = JSON.parse(
      fs.readFileSync(path.join(ctx.testServer.dataDir, "config", "config.json"), "utf-8"),
    );
    expect(config.projects[0].projectSlug).toBe("legacy-proj");
    expect(config.projects[0].slug).toBeUndefined();
    expect(config.lastUsedProjectSlug).toBe("legacy-proj");
    expect(config.lastUsedSlug).toBeUndefined();
  });
});
