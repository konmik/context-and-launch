import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { parseBody } from "./route-helpers.js";

const TestSchema = v.object({ name: v.string() });

describe("parseBody", () => {
	it("returns 400-level error for malformed JSON", async () => {
		const request = new Request("http://localhost/test", {
			method: "POST",
			body: "not json",
		});
		try {
			await parseBody(request, TestSchema);
			expect.unreachable("should have thrown");
		} catch (e: any) {
			expect(e.statusCode).toBe(400);
		}
	});

	it("returns 400 with field-level message for schema-invalid body", async () => {
		const request = new Request("http://localhost/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: 123 }),
		});
		try {
			await parseBody(request, TestSchema);
			expect.unreachable("should have thrown");
		} catch (e: any) {
			expect(e.statusCode).toBe(400);
		}
	});
});
