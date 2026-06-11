import { describe, it, expect } from "vitest";
import { resolveDefaults } from "./agent-launcher-pure.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

describe("resolveDefaults", () => {
	const config = {
		templates: [{ name: "default", text: "" }],
		profiles: [{ name: "fast", command: "" }],
		skills: [],
		shortcuts: [],
		columnDefaults: {
			todo: {
				templateName: "custom",
				profileName: "slow",
				checkedSkills: ["lint"],
				skillOrder: ["lint", "test"],
			},
		},
	} as unknown as MergedLauncherConfig;

	it("returns column defaults when they exist", () => {
		const result = resolveDefaults(config, "todo");
		expect(result).toEqual({
			templateName: "custom",
			profileName: "slow",
			checkedSkills: ["lint"],
			skillOrder: ["lint", "test"],
		});
	});

	it("falls back to first template/profile when no column defaults", () => {
		const result = resolveDefaults(config, "done");
		expect(result).toEqual({
			templateName: "default",
			profileName: "fast",
			checkedSkills: [],
			skillOrder: [],
		});
	});

	it("returns empty defaults for null config", () => {
		const result = resolveDefaults(null, "todo");
		expect(result).toEqual({
			templateName: "",
			profileName: "",
			checkedSkills: [],
			skillOrder: [],
		});
	});
});
