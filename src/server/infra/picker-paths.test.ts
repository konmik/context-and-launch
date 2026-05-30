import { describe, it, expect } from "vitest";
import { normalizeMacPickedPath } from "~/server/infra/picker-paths.js";

describe("normalizeMacPickedPath", () => {
	it("strips a trailing slash from a normal path", () => {
		expect(normalizeMacPickedPath("/Users/me/projects/\n")).toBe(
			"/Users/me/projects",
		);
	});

	it("strips a trailing slash from a path with no trailing newline", () => {
		expect(normalizeMacPickedPath("/Volumes/Disk/")).toBe("/Volumes/Disk");
	});

	it("leaves a path without trailing slash untouched", () => {
		expect(normalizeMacPickedPath("/Users/me\n")).toBe("/Users/me");
	});

	it("preserves '/' when the user selects the filesystem root", () => {
		expect(normalizeMacPickedPath("/\n")).toBe("/");
		expect(normalizeMacPickedPath("/")).toBe("/");
	});
});
