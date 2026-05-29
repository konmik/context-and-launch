import { describe, it, expect } from "vitest";
import { textToErrorInfo } from "./agent-launcher-pure.js";

describe("textToErrorInfo", () => {
	it("extracts description from withService error shape { error: string }", () => {
		const result = textToErrorInfo(
			'{"error":"Worktree root path is not configured"}',
			500,
		);
		expect(result).toEqual({
			description: "Worktree root path is not configured",
		});
	});

	it("returns full ErrorInfo when response has description", () => {
		const result = textToErrorInfo(
			'{"description":"Something failed","command":"git pull","output":"fatal: error"}',
			500,
		);
		expect(result).toEqual({
			description: "Something failed",
			command: "git pull",
			output: "fatal: error",
		});
	});

	it("falls back to JSON.stringify for unknown JSON shapes", () => {
		const result = textToErrorInfo('{"code":42}', 500);
		expect(result).toEqual({ description: '{"code":42}' });
	});

	it("uses plain text when response is not JSON", () => {
		const result = textToErrorInfo("Internal Server Error", 500);
		expect(result).toEqual({ description: "Internal Server Error" });
	});

	it("uses status code fallback for empty text", () => {
		const result = textToErrorInfo("", 502);
		expect(result).toEqual({ description: "Error 502" });
	});
});
