import { describe, it, expect } from "vitest";
import { midpointOrder, orderByNameList } from "./list-reorder.js";

describe("midpointOrder", () => {
	it("returns 0 for an empty list (no neighbours)", () => {
		expect(midpointOrder(undefined, undefined)).toBe(0);
	});

	it("drops below the first item when there is no item before", () => {
		expect(midpointOrder(undefined, 3)).toBe(2);
	});

	it("drops above the last item when there is no item after", () => {
		expect(midpointOrder(3, undefined)).toBe(4);
	});

	it("takes the midpoint between two neighbours", () => {
		expect(midpointOrder(3, 4)).toBe(3.5);
	});

	it("subdivides a fractional gap (the example: 3 and 3.5 -> 3.25)", () => {
		expect(midpointOrder(3, 3.5)).toBe(3.25);
	});

	it("handles negative and zero-crossing neighbours", () => {
		expect(midpointOrder(-1, 1)).toBe(0);
		expect(midpointOrder(undefined, -2)).toBe(-3);
	});
});

describe("orderByNameList", () => {
	const items = [{ name: "a" }, { name: "b" }, { name: "c" }];

	it("returns items unchanged when there is no preferred order", () => {
		expect(orderByNameList(items, []).map(i => i.name)).toEqual(["a", "b", "c"]);
	});

	it("orders items by the preferred name list", () => {
		expect(orderByNameList(items, ["c", "a", "b"]).map(i => i.name)).toEqual(["c", "a", "b"]);
	});

	it("appends items missing from the preferred list in their original order", () => {
		expect(orderByNameList(items, ["c"]).map(i => i.name)).toEqual(["c", "a", "b"]);
	});

	it("ignores preferred names that no longer exist", () => {
		expect(orderByNameList(items, ["gone", "b"]).map(i => i.name)).toEqual(["b", "a", "c"]);
	});
});
