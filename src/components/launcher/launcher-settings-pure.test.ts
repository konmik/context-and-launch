import { describe, it, expect } from "vitest";
import {
	validateColumnName, usesWindowsBatchCommand,
} from "./launcher-settings-pure.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";

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

describe("usesWindowsBatchCommand", () => {
	it.each([
		"run-agent.cmd --prompt {{initialPrompt}}",
		'"C:\\Program Files\\Agent\\RUN.BAT" {{initialPrompt}}',
		"cmd /c run-agent",
		"CMD.EXE /c run-agent",
	])("detects a Windows batch command: %s", (command) => {
		expect(usesWindowsBatchCommand(command)).toBe(true);
	});

	it("detects a batch file passed through a PowerShell launch wrapper", () => {
		const command = "powershell -File {{configDefaultsDir}}/run-agent.ps1 "
			+ "{{initialPrompt}} {{windowTitle}} {{markerPath}} claude1.cmd --dangerously-skip-permissions";
		expect(usesWindowsBatchCommand(command)).toBe(true);
	});

	it.each([
		"run-agent.exe {{initialPrompt}}",
		"powershell -File run-agent.ps1 {{initialPrompt}}",
		"",
	])("does not flag a non-batch command: %s", (command) => {
		expect(usesWindowsBatchCommand(command)).toBe(false);
	});
});
