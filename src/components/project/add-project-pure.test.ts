import { describe, it, expect } from "vitest";
import type { ProjectPathsPreview } from "./add-project-pure.js";

describe("ProjectPathsPreview", () => {
  it("interface accepts projectSlug and mainBranch", () => {
    const preview: ProjectPathsPreview = {
      projectSlug: "my-project",
      mainBranch: "develop",
    };
    expect(preview.projectSlug).toBe("my-project");
    expect(preview.mainBranch).toBe("develop");
  });

  it("mainBranch is optional", () => {
    const preview: ProjectPathsPreview = {
      projectSlug: "my-project",
    };
    expect(preview.mainBranch).toBeUndefined();
  });
});
