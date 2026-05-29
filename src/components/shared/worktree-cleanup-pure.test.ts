import { describe, it, expect, beforeEach } from "vitest";
import {
  loadCleanupOptions, saveCleanupOptions, toErrorInfo,
} from "./worktree-cleanup-pure.js";

describe("toErrorInfo", () => {
  it("wraps string into ErrorInfo", () => {
    expect(toErrorInfo("oops")).toEqual({ description: "oops" });
  });
  it("passes through ErrorInfo object", () => {
    const err = { description: "fail", command: "git pull" };
    expect(toErrorInfo(err)).toBe(err);
  });
});

describe("loadCleanupOptions", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when localStorage is empty", () => {
    expect(loadCleanupOptions()).toEqual({
      deleteWorktree: true,
      deleteLocalBranch: true,
      deleteRemoteBranch: false,
    });
  });

  it("returns stored values", () => {
    const opts = { deleteWorktree: false, deleteLocalBranch: false, deleteRemoteBranch: true };
    localStorage.setItem("worktree-cleanup-options", JSON.stringify(opts));
    expect(loadCleanupOptions()).toEqual(opts);
  });

  it("returns defaults for invalid JSON", () => {
    localStorage.setItem("worktree-cleanup-options", "bad-json");
    expect(loadCleanupOptions()).toEqual({
      deleteWorktree: true,
      deleteLocalBranch: true,
      deleteRemoteBranch: false,
    });
  });
});

describe("saveCleanupOptions", () => {
  beforeEach(() => localStorage.clear());

  it("persists options to localStorage", () => {
    const opts = { deleteWorktree: false, deleteLocalBranch: true, deleteRemoteBranch: true };
    saveCleanupOptions(opts);
    expect(JSON.parse(localStorage.getItem("worktree-cleanup-options")!)).toEqual(opts);
  });
});
