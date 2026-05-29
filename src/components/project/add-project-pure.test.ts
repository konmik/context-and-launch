import { describe, it, expect } from "vitest";
import { applyPreview } from "./add-project-pure.js";

describe("applyPreview", () => {
  const preview = {
    projectSlug: "my-project",
    ticketsPath: "/tickets",
    defaultWorktreesPath: "/worktrees",
  };

  it("returns both paths when neither is touched", () => {
    expect(applyPreview(preview, false, false)).toEqual({
      ticketsRootPath: "/tickets",
      worktreeRootPath: "/worktrees",
    });
  });

  it("skips ticketsRootPath when touched", () => {
    expect(applyPreview(preview, true, false)).toEqual({
      worktreeRootPath: "/worktrees",
    });
  });

  it("skips worktreeRootPath when touched", () => {
    expect(applyPreview(preview, false, true)).toEqual({
      ticketsRootPath: "/tickets",
    });
  });

  it("returns empty when both touched", () => {
    expect(applyPreview(preview, true, true)).toEqual({});
  });

  it("returns empty for null preview", () => {
    expect(applyPreview(null, false, false)).toEqual({});
  });
});
