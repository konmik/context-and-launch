import { FileDiff, type SelectedLineRange } from "@pierre/diffs";
import { createEffect, onSettled } from "solid-js";
import type {
	DiffLayout,
	DiffLineOverflow,
	ReviewFileSnapshot,
	ReviewLineRange,
	ReviewLineSide,
} from "~/core/diff-review/diff-review-types.js";
import type { ReviewChangeLocation } from "~/core/diff-review/review-navigation.js";
import {
	isGutterPath,
	reviewLineRangeBetween,
	reviewLineRangeFromSelection,
} from "./diff-review-selection.js";

function changedLineKey(side: "deletions" | "additions", lineNumber: number): string {
	return `${side === "deletions" ? "d" : "a"}:${lineNumber}`;
}

function changedLineText(file: ReviewFileSnapshot): Map<string, string> {
	const result = new Map<string, string>();
	for (const line of file.lines) {
		if (line.type === "addition" && line.newLineNumber !== undefined) {
			result.set(changedLineKey("additions", line.newLineNumber), line.text);
		}
		if (line.type === "deletion" && line.oldLineNumber !== undefined) {
			result.set(changedLineKey("deletions", line.oldLineNumber), line.text);
		}
	}
	return result;
}

function setPromptDragData(
	event: DragEvent,
	text: string,
	onError: (message: string) => void,
) {
	if (!event.dataTransfer) {
		onError("The drag carried no data, so the Review Prompt was not attached to it.");
		return;
	}
	// Chromium seeds a selection drag with text/html as well, so the markup has to
	// go before the prompt is attached or rich-text targets paste the diff instead.
	event.dataTransfer.clearData();
	event.dataTransfer.effectAllowed = "copy";
	event.dataTransfer.setData("text/plain", text);
}

export default function DiffSurface(props: {
	file: ReviewFileSnapshot;
	layout: DiffLayout;
	lineOverflow: DiffLineOverflow;
	selection?: ReviewLineRange;
	jumpTarget?: ReviewChangeLocation;
	scrollRoot: () => HTMLElement | undefined;
	onSelect(range: SelectedLineRange | null): void;
	onJumpApplied(): void;
	onChangedLineVisible(lineId: string): void;
	onError(message: string): void;
	dragText(): string | undefined;
}) {
	let hostRef: HTMLDivElement | undefined;
	let diff: FileDiff | undefined;
	let observer: IntersectionObserver | undefined;
	let previousLines: Map<string, string> | undefined;
	let previousPath: string | undefined;
	let surfaceRoot: ShadowRoot | HTMLElement | undefined;
	let renderedIdentity: string | undefined;
	let pointerStartedOnGutter = false;
	let pointerStartedInside = false;
	let pendingRender = false;

	function changedRow(side: ReviewLineSide, lineNumber: number): HTMLElement | undefined {
		if (!surfaceRoot) return undefined;
		const lineType = side === "deletions" ? "change-deletion" : "change-addition";
		const column = surfaceRoot.querySelector(
			side === "deletions"
				? "[data-code][data-deletions]"
				: "[data-code][data-additions]",
		) ?? surfaceRoot;
		return column.querySelector<HTMLElement>(
			`[data-line="${lineNumber}"][data-line-type="${lineType}"]`,
		) ?? surfaceRoot.querySelector<HTMLElement>(
			`[data-line="${lineNumber}"][data-line-type="${lineType}"]`,
		) ?? undefined;
	}

	function applyJump() {
		const target = props.jumpTarget;
		if (!target || target.filePath !== props.file.path) return;
		const row = changedRow(target.side, target.lineNumber);
		if (!row) return;
		row.scrollIntoView({ block: "center", behavior: "smooth" });
		props.onJumpApplied();
	}

	function handlePointerDown(event: PointerEvent) {
		pointerStartedInside = true;
		pointerStartedOnGutter = isGutterPath(event.composedPath());
	}

	// Dragging the highlighted rows is a native text-selection drag: Chromium
	// fires dragstart with the raw selected text, and drag events cross the
	// shadow boundary, so the host can swap in the full Review Prompt.
	function handleDragStart(event: DragEvent) {
		const text = props.dragText();
		if (!text) return;
		setPromptDragData(event, text, props.onError);
	}

	// A native drag swallows the pointerup, so the gesture has to be closed out
	// here or renders stay deferred forever.
	function handleDragEnd() {
		pointerStartedInside = false;
		pointerStartedOnGutter = false;
		if (pendingRender) render();
	}

	function handleDocumentPointerUp(event: PointerEvent) {
		if (!pointerStartedInside) return;
		pointerStartedInside = false;
		const ownedByLibrary = pointerStartedOnGutter;
		const root = surfaceRoot;
		const clickedLine = event.composedPath().find((node): node is HTMLElement =>
			node instanceof HTMLElement && node.hasAttribute("data-line"));
		queueMicrotask(() => {
			if (!ownedByLibrary && root) {
				const range = reviewLineRangeFromSelection(
					root,
					document.getSelection(),
				) ?? reviewLineRangeBetween(clickedLine, clickedLine);
				props.onSelect(range ?? null);
			}
			if (pendingRender) render();
		});
	}

	function observeLines(node: HTMLElement, blinkKeys: Set<string>) {
		observer?.disconnect();
		const root = node.shadowRoot ?? node;
		surfaceRoot = root;
		const rows = [...root.querySelectorAll<HTMLElement>(
			'[data-line][data-line-type="change-addition"],'
			+ '[data-line][data-line-type="change-deletion"]',
		)];
		const handleVisible = (row: HTMLElement) => {
			const lineNumber = Number(row.dataset.line);
			if (!Number.isFinite(lineNumber)) return;
			const side = row.dataset.lineType === "change-deletion" ? "deletions" : "additions";
			const key = changedLineKey(side, lineNumber);
			const line = props.file.lines.find((candidate) =>
				candidate.type === (side === "deletions" ? "deletion" : "addition")
				&& (side === "deletions"
					? candidate.oldLineNumber === lineNumber
					: candidate.newLineNumber === lineNumber));
			if (!line) return;
			props.onChangedLineVisible(line.id);
			if (blinkKeys.has(key)) {
				row.dataset.reviewBlink = "";
				setTimeout(() => delete row.dataset.reviewBlink, 900);
			}
		};
		const Observer = globalThis.IntersectionObserver;
		if (Observer === undefined) {
			for (const row of rows) handleVisible(row);
			return;
		}
		observer = new Observer((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && entry.target instanceof HTMLElement) handleVisible(entry.target);
			}
		}, { root: props.scrollRoot() });
		for (const row of rows) observer.observe(row);
	}

	function options(blinkKeys: Set<string>) {
		return {
			theme: { dark: "github-dark", light: "github-light" },
			themeType: document.documentElement.classList.contains("dark")
				? "dark" as const
				: "light" as const,
			diffStyle: props.layout,
			diffIndicators: "bars" as const,
			overflow: props.lineOverflow,
			hunkSeparators: "line-info-basic" as const,
			lineDiffType: "word-alt" as const,
			lineHoverHighlight: "both" as const,
			enableLineSelection: true,
			onLineSelectionEnd: props.onSelect,
			onPostRender: (node: HTMLElement) => queueMicrotask(() => {
				observeLines(node, blinkKeys);
				applyJump();
			}),
			unsafeCSS: `:host {
				--diffs-font-family: var(--font-mono);
				--diffs-header-font-family: Inter, system-ui, sans-serif;
				--diffs-font-size: 12px;
				--diffs-line-height: 20px;
				--diffs-light-bg: var(--background);
				--diffs-dark-bg: var(--background);
				--diffs-light: var(--foreground);
				--diffs-dark: var(--foreground);
				--diffs-modified-color: var(--primary);
				display: block;
				min-width: 100%;
			}
			[data-review-blink] {
				animation: review-line-blink 850ms ease-out;
			}
			@keyframes review-line-blink {
				0%, 35% { filter: brightness(1.7); }
				100% { filter: none; }
			}
			@media (prefers-reduced-motion: reduce) {
				[data-review-blink] { animation: none; }
			}`,
		};
	}

	function render() {
		if (!hostRef || !diff) return;
		const identity =
			`${props.file.path}\0${props.file.contentHash}\0${props.layout}\0${props.lineOverflow}`;
		if (identity === renderedIdentity) return;
		if (pointerStartedInside) {
			pendingRender = true;
			return;
		}
		pendingRender = false;
		renderedIdentity = identity;
		const currentLines = changedLineText(props.file);
		const blinkKeys = new Set<string>();
		if (previousLines && previousPath === props.file.path) {
			for (const [key, text] of currentLines) {
				if (previousLines.get(key) !== text) blinkKeys.add(key);
			}
		}
		previousLines = currentLines;
		previousPath = props.file.path;
		diff.setOptions(options(blinkKeys));
		diff.render({
			oldFile: {
				name: props.file.previousPath ?? props.file.path,
				contents: props.file.oldContents ?? "",
				cacheKey: `${props.file.contentHash}:old`,
			},
			newFile: {
				name: props.file.path,
				contents: props.file.newContents ?? "",
				cacheKey: `${props.file.contentHash}:new`,
			},
			containerWrapper: hostRef,
			forceRender: true,
		});
	}

	onSettled(() => {
		diff = new FileDiff(options(new Set()));
		render();
		hostRef?.addEventListener("pointerdown", handlePointerDown);
		hostRef?.addEventListener("dragstart", handleDragStart);
		document.addEventListener("dragend", handleDragEnd);
		document.addEventListener("pointerup", handleDocumentPointerUp);
		return () => {
			hostRef?.removeEventListener("pointerdown", handlePointerDown);
			hostRef?.removeEventListener("dragstart", handleDragStart);
			document.removeEventListener("dragend", handleDragEnd);
			document.removeEventListener("pointerup", handleDocumentPointerUp);
			observer?.disconnect();
			diff?.cleanUp();
		};
	});
	createEffect(() => [props.file.contentHash, props.layout, props.lineOverflow], () => {
		render();
	});
	createEffect(() => props.selection, (range) => {
		diff?.setSelectedLines(range ? { ...range } : null, { notify: false });
	});
	createEffect(() => props.jumpTarget, () => {
		applyJump();
	});
	return (
		<div
			ref={hostRef}
			class="min-w-0 rounded-b-md border border-t-0 border-border bg-background"
			data-testid="diff-review-file-diff"
			data-file-path={props.file.path}
		/>
	);
}
