import { describe, expect, it, vi } from "vitest";
import { shardTestCases } from "./test-shard.js";

function fakeTestApi() {
	const run = vi.fn();
	const skip = vi.fn();
	const concurrent = vi.fn();
	const conditional = Object.assign(vi.fn(), { concurrent: vi.fn() });
	return Object.assign(run, {
		skip,
		concurrent,
		runIf: vi.fn(() => conditional),
		skipIf: vi.fn(() => conditional),
	});
}

describe("shardTestCases", () => {
	it("registers every declaration selected by a grouped shard", () => {
		const base = fakeTestApi();
		const shard = shardTestCases(base as unknown as typeof it, [0, 2], 3);

		shard("zero", () => undefined);
		shard("one", () => undefined);
		shard("two", () => undefined);
		shard("three", () => undefined);

		expect(base).toHaveBeenCalledTimes(3);
		expect(base.mock.calls.map(([name]) => name)).toEqual(["zero", "two", "three"]);
		expect(base.skip).toHaveBeenCalledOnce();
		expect(base.skip).toHaveBeenCalledWith("one", expect.any(Function));
	});

	it("rejects empty, duplicate, and out-of-range shard groups", () => {
		const base = fakeTestApi();

		expect(() => shardTestCases(base as unknown as typeof it, [], 3)).toThrow("Invalid test shard");
		expect(() => shardTestCases(base as unknown as typeof it, [1, 1], 3)).toThrow("Invalid test shard");
		expect(() => shardTestCases(base as unknown as typeof it, [3], 3)).toThrow("Invalid test shard");
	});
});
