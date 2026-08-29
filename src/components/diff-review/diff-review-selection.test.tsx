import { describe, expect, it } from "vitest";
import {
	isGutterPath,
	lineElementAt,
	lineSideOf,
	reviewLineRangeBetween,
	reviewLineRangeFromSelection,
} from "./diff-review-selection.js";

function renderSplitDiff() {
	const host = document.createElement("div");
	host.innerHTML = `
		<div data-code data-deletions>
			<span data-column-number="4" data-line-type="change-deletion">4</span>
			<span data-line="4" data-line-type="change-deletion">const old = 1;</span>
			<span data-line="5" data-line-type="context">const kept = 2;</span>
		</div>
		<div data-code data-additions>
			<span data-line="4" data-line-type="change-addition">const next = 1;</span>
			<span data-line="5" data-line-type="context">const kept = 2;</span>
		</div>`;
	document.body.replaceChildren(host);
	return {
		host,
		line(side: string, value: string) {
			const column = host.querySelector(`[data-code][data-${side}]`)!;
			return column.querySelector<HTMLElement>(`[data-line="${value}"]`)!;
		},
	};
}

describe("Diff Review text selection", () => {
	it("resolves a range from a text node inside a code line", () => {
		const diff = renderSplitDiff();
		const from = diff.line("deletions", "4").firstChild;
		const to = diff.line("deletions", "5").firstChild;

		expect(lineElementAt(from)).toBe(diff.line("deletions", "4"));
		expect(reviewLineRangeBetween(from, to)).toEqual({
			start: 4,
			side: "deletions",
			end: 5,
			endSide: "deletions",
		});
	});

	it("normalizes a backwards selection and keeps each end's side", () => {
		const diff = renderSplitDiff();
		expect(reviewLineRangeBetween(
			diff.line("additions", "5"),
			diff.line("deletions", "4"),
		)).toEqual({ start: 4, side: "deletions", end: 5, endSide: "additions" });
	});

	it("selects a single line when the selection is collapsed on it", () => {
		const diff = renderSplitDiff();
		expect(reviewLineRangeBetween(diff.line("additions", "4"), undefined)).toEqual({
			start: 4,
			side: "additions",
			end: 4,
			endSide: "additions",
		});
	});

	it("takes a context line's side from its code column", () => {
		const diff = renderSplitDiff();
		expect(lineSideOf(diff.line("deletions", "5"))).toBe("deletions");
		expect(lineSideOf(diff.line("additions", "5"))).toBe("additions");
	});

	it("recognizes the line-number gutter so the library keeps owning it", () => {
		const diff = renderSplitDiff();
		const gutter = diff.host.querySelector<HTMLElement>("[data-column-number]")!;
		expect(isGutterPath([gutter, diff.host])).toBe(true);
		expect(isGutterPath([diff.line("additions", "4"), diff.host])).toBe(false);
	});

	it("ignores nodes outside any diff line", () => {
		renderSplitDiff();
		expect(reviewLineRangeBetween(document.body, document.body)).toBeUndefined();
	});

	it("ignores selections that cross between file surfaces", () => {
		const first = renderSplitDiff();
		const second = document.createElement("div");
		second.innerHTML = '<span data-line="6" data-line-type="change-addition">next</span>';
		document.body.append(second);
		const range = document.createRange();
		range.setStart(first.line("additions", "4").firstChild!, 0);
		range.setEnd(second.querySelector("[data-line]")!.firstChild!, 1);
		const selection = document.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);

		expect(reviewLineRangeFromSelection(first.host, selection)).toBeUndefined();
	});
});
