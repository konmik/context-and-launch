import { describe, it, expect } from "vitest";
import { parseSyncResult } from "./project-page-pure.js";

describe("parseSyncResult", () => {
  it("returns success for status success", () => {
    expect(parseSyncResult({ status: "success" })).toEqual({ type: "success" });
  });
  it("returns conflict for status conflict", () => {
    expect(parseSyncResult({ status: "conflict" })).toEqual({ type: "conflict" });
  });
  it("returns error with message for status error", () => {
    expect(parseSyncResult({ status: "error", message: "Oops" }))
      .toEqual({ type: "error", message: "Oops" });
  });
  it("uses fallback message for error without message", () => {
    expect(parseSyncResult({ status: "error" }))
      .toEqual({ type: "error", message: "Sync failed" });
  });
  it("returns error for unexpected status", () => {
    expect(parseSyncResult({ status: "unknown" }))
      .toEqual({ type: "error", message: "Sync failed" });
  });
});
