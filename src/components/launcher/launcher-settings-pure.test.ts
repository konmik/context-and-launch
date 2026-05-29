import { describe, it, expect } from "vitest";
import { itemEndpoint, validateColumnName, buildFormPayload } from "./launcher-settings-pure.js";
import type { ColumnDefinition } from "~/server/project/board-config.js";
import type { ItemFormState } from "./launcher-settings-dialogs.js";

describe("itemEndpoint", () => {
	it("returns app-level endpoint", () => {
		expect(itemEndpoint("proj", "template", "app"))
			.toBe("/api/launcher-config/templates");
	});

	it("returns project-level endpoint", () => {
		expect(itemEndpoint("proj", "skill", "project"))
			.toBe("/api/projects/proj/launcher-config/skills");
	});
});

describe("validateColumnName", () => {
	const columns: ColumnDefinition[] = [
		{ name: "todo", description: "" },
		{ name: "done", description: "" },
	];

	it("returns empty for valid new name", () => {
		expect(validateColumnName("in-progress", "add", undefined, columns)).toBe("");
	});

	it("rejects duplicate name", () => {
		expect(validateColumnName("todo", "add", undefined, columns))
			.toBe('Name "todo" already exists');
	});

	it("allows same name in edit mode", () => {
		expect(validateColumnName("todo", "edit", "todo", columns)).toBe("");
	});

	it("rejects 'undefined' as reserved", () => {
		expect(validateColumnName("undefined", "add", undefined, []))
			.toBe('Name "undefined" is reserved');
	});
});

describe("buildFormPayload", () => {
	it("builds add payload for template", () => {
		const form: ItemFormState = {
			mode: "add", itemType: "template", scope: "app",
			name: "my-tmpl", text: "content",
		};
		expect(buildFormPayload(form)).toEqual({ name: "my-tmpl", text: "content" });
	});

	it("builds edit payload for profile with command field", () => {
		const form: ItemFormState = {
			mode: "edit", itemType: "profile", scope: "app",
			name: "fast", text: "claude -f", oldName: "old",
		};
		expect(buildFormPayload(form)).toEqual({
			oldName: "old", name: "fast", command: "claude -f",
		});
	});
});
