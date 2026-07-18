import { describe, it, expect } from "vitest";
import {
  noCleanupOptions, possibleCleanupOptions, toErrorInfo,
  allChecking, allError, effectiveCleanupOptions,
  type TicketCleanupOptions, type TicketCleanupItemStates,
} from "./ticket-cleanup-pure.js";

describe("noCleanupOptions", () => {
  it("returns all keys unticked", () => {
    expect(noCleanupOptions()).toEqual({
      stopHerdrAgent: false, deleteWorktree: false, deleteLocalBranch: false, deleteRemoteBranch: false,
    });
  });
});

describe("possibleCleanupOptions", () => {
  it("ticks only ready items", () => {
    const items: TicketCleanupItemStates = {
      stopHerdrAgent: { state: "ready" },
      deleteWorktree: { state: "blocked", reason: "No worktree" },
      deleteLocalBranch: { state: "error", error: { description: "boom" } },
      deleteRemoteBranch: { state: "ready" },
    };
    expect(possibleCleanupOptions(items)).toEqual({
      stopHerdrAgent: true, deleteWorktree: false, deleteLocalBranch: false, deleteRemoteBranch: true,
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

describe("effectiveCleanupOptions", () => {
  const items: TicketCleanupItemStates = {
    stopHerdrAgent: { state: "ready" },
    deleteWorktree: { state: "blocked", reason: "No worktree" },
    deleteLocalBranch: { state: "checking" },
    deleteRemoteBranch: { state: "ready" },
  };

  it("keeps checked+ready true and drops the rest", () => {
    const options: TicketCleanupOptions = {
      stopHerdrAgent: true, deleteWorktree: true, deleteLocalBranch: true, deleteRemoteBranch: false,
    };
    expect(effectiveCleanupOptions(options, items)).toEqual({
      stopHerdrAgent: true,
      deleteWorktree: false,
      deleteLocalBranch: false,
      deleteRemoteBranch: false,
    });
  });
});
