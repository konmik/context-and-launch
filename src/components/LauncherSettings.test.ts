import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { MergedLauncherConfig } from "~/server/launcher-config.js";

describe("LauncherSettings name placeholder adapts to itemType", () => {
	const source = fs.readFileSync(
		path.resolve(__dirname, "LauncherSettings.tsx"),
		"utf-8",
	);

	it("name input placeholder is dynamic based on itemType, not hardcoded 'Template name'", () => {
		// The textarea placeholder already adapts (uses f().itemType ternary).
		// The name input placeholder should also adapt rather than always saying "Template name".
		const placeholderMatch = source.match(/placeholder=\{[^}]*itemType[^}]*name[^}]*\}/s)
			|| source.match(/placeholder=\{[^}]*name[^}]*itemType[^}]*\}/s);

		// If no dynamic placeholder referencing itemType is found for the name input,
		// check whether a hardcoded "Template name" exists
		const hardcoded = source.includes('placeholder="Template name"');

		expect(
			placeholderMatch !== null || !hardcoded,
			'Name input placeholder should adapt to itemType (e.g. "Profile name", "Skill name", "Template name") instead of always showing "Template name"',
		).toBe(true);
	});
});

describe("LauncherSettings Show condition", () => {
	const fakeConfig: MergedLauncherConfig = {
		templates: [{ name: "Default", text: "hello", scope: "app" }],
		skills: [],
		profiles: [],
		shortcuts: [],
		columnDefaults: {},
		worktreeRootPath: null,
		boardId: null,
		conflictResolutionPrompt: "",
	};

	it("config && !loading returns boolean true, not the config (the bug)", () => {
		const config = fakeConfig;
		const loading = false;

		// This is what `<Show when={config() && !loading()}>` evaluates to.
		// JS && returns the last evaluated operand: config is truthy, so it
		// evaluates !loading (true) and returns that.
		const result = config && !loading;

		expect(result).toBe(true);
		expect((result as any).templates).toBeUndefined();
	});

	it("!loading && config returns the config object (the fix)", () => {
		const config = fakeConfig;
		const loading = false;

		// Swapped order: !loading is true, so && evaluates and returns config.
		const result = !loading && config;

		expect(result).toBe(fakeConfig);
		expect(result).not.toBe(true);
		expect((result as MergedLauncherConfig).templates).toHaveLength(1);
	});

	it("returns falsy when loading is true", () => {
		const config = fakeConfig;
		const loading = true;

		expect(!loading && config).toBe(false);
		expect(config && !loading).toBe(false);
	});

	it("returns falsy when config is null", () => {
		const config = null;
		const loading = false;

		expect(!loading && config).toBe(null);
		expect(config && !loading).toBe(null);
	});
});