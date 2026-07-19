import { describe, it, expect } from "vitest";
import {
  noCleanupOptions, singleCleanupOption, toErrorInfo, allChecking, allError,
} from "./ticket-cleanup-pure.js";

describe("noCleanupOptions", () => {
  it("returns all keys unticked", () => {
    expect(noCleanupOptions()).toEqual({
      stopHerdrAgent: false, deleteWorktree: false, deleteLocalBranch: false, deleteRemoteBranch: false,
    });
  });
});

describe("singleCleanupOption", () => {
  it("enables only the requested cleanup item", () => {
    expect(singleCleanupOption("deleteWorktree")).toEqual({
      stopHerdrAgent: false, deleteWorktree: true,
      deleteLocalBranch: false, deleteRemoteBranch: false,
    });
  });
});

describe("toErrorInfo", () => {
  it("wraps a string in a description", () => {
    expect(toErrorInfo("boom")).toEqual({ description: "boom" });
  });

  it("returns an ErrorInfo object unchanged", () => {
    const info = { description: "boom", command: "git" };
    expect(toErrorInfo(info)).toBe(info);
  });
});

describe("allChecking / allError", () => {
  it("produces all four keys checking", () => {
    expect(allChecking()).toEqual({
      stopHerdrAgent: { state: "checking" },
      deleteWorktree: { state: "checking" },
      deleteLocalBranch: { state: "checking" },
      deleteRemoteBranch: { state: "checking" },
    });
  });

  it("produces all four keys in error", () => {
    const error = { description: "failed" };
    expect(allError(error)).toEqual({
      stopHerdrAgent: { state: "error", error },
      deleteWorktree: { state: "error", error },
      deleteLocalBranch: { state: "error", error },
      deleteRemoteBranch: { state: "error", error },
    });
  });
});
