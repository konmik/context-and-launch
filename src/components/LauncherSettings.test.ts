import { describe, it, expect } from "vitest";
import type { MergedLauncherConfig } from "~/types.js";

describe("LauncherSettings Show condition", () => {
	const fakeConfig: MergedLauncherConfig = {
		templates: [{ name: "Default", text: "hello", scope: "app" }],
		skills: [],
		columnDefaults: {},
		worktreeRootPath: null,
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
