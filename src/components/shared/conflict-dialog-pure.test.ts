import { describe, it, expect } from "vitest";
import { extractProfiles } from "./conflict-dialog-pure.js";

describe("extractProfiles", () => {
  it("extracts profile names from valid data", () => {
    const data = { profiles: [{ name: "fast" }, { name: "slow" }] };
    expect(extractProfiles(data)).toEqual([{ name: "fast" }, { name: "slow" }]);
  });
  it("returns empty array for null", () => {
    expect(extractProfiles(null)).toEqual([]);
  });
  it("returns empty array for missing profiles", () => {
    expect(extractProfiles({})).toEqual([]);
  });
  it("returns empty array for non-array profiles", () => {
    expect(extractProfiles({ profiles: "bad" })).toEqual([]);
  });
});
