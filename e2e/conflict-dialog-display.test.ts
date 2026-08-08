import { describe, it, expect } from "vitest";
import {
  gotoProject, openProject, seedProject, setupE2E,
  openConflictDialog,
} from "./fixtures.js";
import { createActiveRebaseConflict, CONFLICT_LAUNCHER } from "./conflict-dialog-shared.js";
import { countOf, testId, waitVisible, waitGone } from "./locators.js";

describe("Conflict dialog display (e2e, real server)", () => {
  const ctx = setupE2E();

  /** Seeds a Project whose tickets worktree is already mid-rebase, then opens it. */
  async function openConflictedProject(slugBase: string) {
    const project = await seedProject(ctx, {
      slugBase,
      withRemote: true,
      appLauncherConfig: CONFLICT_LAUNCHER,
    });
    createActiveRebaseConflict(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    return project;
  }

  it("conflict dialog elements render when sync returns conflict (intercepted)", async () => {
    await openConflictedProject("conflict-rendering");
    await openConflictDialog(ctx.page);

    expect(await countOf(ctx.page, "conflict-dialog-open-tickets-repo")).toBe(1);
    expect(await countOf(ctx.page, "conflict-dialog-close")).toBe(1);
    expect(await countOf(ctx.page, "conflict-dialog-launch")).toBe(1);
    expect(await countOf(ctx.page, "conflict-dialog-abort")).toBeLessThanOrEqual(1);

    await testId(ctx.page, "conflict-dialog-close").click();
    await waitGone(ctx.page, "conflict-dialog-profile-select");
  });

  it("sync during active rebase conflict shows conflict dialog (regression: HEAD-detached error)", async () => {
    await openConflictedProject("conflict-active-rebase");
    await openConflictDialog(ctx.page);
  });

  it("abort dismisses the dialog during an active rebase", async () => {
    await openConflictedProject("conflict-abort");
    await openConflictDialog(ctx.page);
    expect(await countOf(ctx.page, "conflict-dialog-abort")).toBe(1);
    await testId(ctx.page, "conflict-dialog-abort").click();
    await waitGone(ctx.page, "conflict-dialog-abort");
  });

  it("conflict badge appears after dismissing a mid-session sync conflict", async () => {
    const project = await openProject(ctx, {
      slugBase: "conflict-badge-mid-session",
      withRemote: true,
      appLauncherConfig: CONFLICT_LAUNCHER,
    });
    expect(await countOf(ctx.page, "sync-button-conflict-badge")).toBe(0);

    createActiveRebaseConflict(project);

    await openConflictDialog(ctx.page);
    await testId(ctx.page, "conflict-dialog-close").click();
    await waitGone(ctx.page, "conflict-dialog-profile-select");

    await waitVisible(ctx.page, "sync-button-conflict-badge");
    expect(await countOf(ctx.page, "sync-button-pending-badge")).toBe(0);
  });
});
