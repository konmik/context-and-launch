import { describe, it, expect } from "vitest";
import { applyPreview } from "./add-project-pure.js";

describe("applyPreview", () => {
  const preview = {
    projectSlug: "my-project",
    ticketsPath: "/tickets",
    defaultWorktreesPath: "/worktrees",
  };

  it("returns both paths when neither is touched", () => {
    expect(applyPreview(preview, false, false, false)).toEqual({
      ticketsRootPath: "/tickets",
      worktreeRootPath: "/worktrees",
    });
  });

  it("skips ticketsRootPath when touched", () => {
    expect(applyPreview(preview, true, false, false)).toEqual({
      worktreeRootPath: "/worktrees",
    });
  });

  it("skips worktreeRootPath when touched", () => {
    expect(applyPreview(preview, false, true, false)).toEqual({
      ticketsRootPath: "/tickets",
    });
  });

  it("returns empty when both touched", () => {
    expect(applyPreview(preview, true, true, false)).toEqual({});
  });

  it("returns empty for null preview", () => {
    expect(applyPreview(null, false, false, false)).toEqual({});
  });

  it("returns mainBranch from preview when not touched", () => {
    expect(applyPreview({ ...preview, mainBranch: "develop" }, false, false, false))
      .toMatchObject({ mainBranch: "develop" });
  });

  it("omits mainBranch when touched", () => {
    const result = applyPreview({ ...preview, mainBranch: "develop" }, false, false, true);
    expect("mainBranch" in result).toBe(false);
  });

  it("omits mainBranch when preview has no mainBranch", () => {
    const result = applyPreview(preview, false, false, false);
    expect("mainBranch" in result).toBe(false);
  });
});
