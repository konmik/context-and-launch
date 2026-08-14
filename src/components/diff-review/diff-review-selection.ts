import type {
	ReviewLineRange,
	ReviewLineSide,
} from "~/core/diff-review/diff-review-types.js";

interface ComposedRangeSelection {
	getComposedRanges(options: { shadowRoots: ShadowRoot[] }): StaticRange[];
}

function isComposedRangeSelection(
	selection: Selection,
): selection is Selection & ComposedRangeSelection {
	return typeof (selection as Partial<ComposedRangeSelection>).getComposedRanges
		=== "function";
}

export function lineElementAt(node: Node | null | undefined): HTMLElement | undefined {
	let current: Node | null = node ?? null;
	while (current) {
		if (current instanceof HTMLElement && current.hasAttribute("data-line")) return current;
		current = current.parentNode instanceof ShadowRoot
			? current.parentNode.host
			: current.parentNode;
	}
	return undefined;
}

export function lineSideOf(lineElement: HTMLElement): ReviewLineSide {
	const lineType = lineElement.getAttribute("data-line-type");
	if (lineType === "change-deletion") return "deletions";
	if (lineType === "change-addition") return "additions";
	return lineElement.closest("[data-code]")?.hasAttribute("data-deletions")
		? "deletions"
		: "additions";
}

export function reviewLineRangeBetween(
	startNode: Node | null | undefined,
	endNode: Node | null | undefined,
): ReviewLineRange | undefined {
	const first = lineElementAt(startNode);
	const last = lineElementAt(endNode) ?? first;
	if (!first || !last) return undefined;
	const backwards = (first.compareDocumentPosition(last)
		& Node.DOCUMENT_POSITION_PRECEDING) !== 0;
	const head = backwards ? last : first;
	const tail = backwards ? first : last;
	const start = Number(head.getAttribute("data-line"));
	const end = Number(tail.getAttribute("data-line"));
	if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
	return { start, side: lineSideOf(head), end, endSide: lineSideOf(tail) };
}

export function selectedNodes(
	root: ShadowRoot | HTMLElement,
	documentSelection: Selection | null,
): { start: Node; end: Node } | undefined {
	const shadowRoots = root instanceof ShadowRoot ? [root] : [];
	if (documentSelection && isComposedRangeSelection(documentSelection)) {
		const [range] = documentSelection.getComposedRanges({ shadowRoots });
		if (
			range
			&& root.contains(lineElementAt(range.startContainer) ?? range.startContainer)
			&& root.contains(lineElementAt(range.endContainer) ?? range.endContainer)
		) {
			return { start: range.startContainer, end: range.endContainer };
		}
	}
	const rootSelection = root instanceof ShadowRoot
		? (root as ShadowRoot & { getSelection?(): Selection | null }).getSelection?.()
		: documentSelection;
	const anchorNode = rootSelection?.anchorNode;
	const focusNode = rootSelection?.focusNode;
	if (!anchorNode || !focusNode) return undefined;
	if (
		!root.contains(lineElementAt(anchorNode) ?? anchorNode)
		|| !root.contains(lineElementAt(focusNode) ?? focusNode)
	) return undefined;
	return { start: anchorNode, end: focusNode };
}

export function reviewLineRangeFromSelection(
	root: ShadowRoot | HTMLElement,
	documentSelection: Selection | null,
): ReviewLineRange | undefined {
	const nodes = selectedNodes(root, documentSelection);
	if (!nodes) return undefined;
	return reviewLineRangeBetween(nodes.start, nodes.end);
}

export function isGutterPath(path: readonly EventTarget[]): boolean {
	return path.some((node) =>
		node instanceof HTMLElement && node.hasAttribute("data-column-number"));
}
