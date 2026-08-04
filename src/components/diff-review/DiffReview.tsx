import { FileDiff, type SelectedLineRange } from "@pierre/diffs";
import { revalidate } from "@solidjs/router";
import {
	ErrorBoundary,
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import AlertTriangle from "lucide-solid/icons/triangle-alert";
import ArrowDownToLine from "lucide-solid/icons/arrow-down-to-line";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import FileCode2 from "lucide-solid/icons/file-code-2";
import FileWarning from "lucide-solid/icons/file-warning";
import GitCompareArrows from "lucide-solid/icons/git-compare-arrows";
import GripVertical from "lucide-solid/icons/grip-vertical";
import LoaderCircle from "lucide-solid/icons/loader-circle";
import Pause from "lucide-solid/icons/pause";
import Play from "lucide-solid/icons/play";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Send from "lucide-solid/icons/send";
import X from "lucide-solid/icons/x";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type {
	DiffLayout,
	DiffScope,
	ReviewFileSnapshot,
	ReviewLineRange,
	ReviewLineSide,
	ReviewPace,
	ReviewPromptQueueItem,
	ReviewPromptSnapshot,
	ReviewSnapshot,
} from "~/core/diff-review/diff-review-types.js";
import {
	buildReviewPromptSnapshot,
	reviewSelectionStillExists,
} from "~/core/diff-review/diff-review-model.js";
import { reuseUnchangedFiles } from "~/core/diff-review/review-file-identity.js";
import { renderReviewPrompt } from "~/core/diff-review/review-prompt-text.js";
import {
	fileIsReviewed,
	nextUnreviewedChange,
	unreviewedChangeCount,
	type ReviewChangeLocation,
} from "~/core/diff-review/review-navigation.js";
import { createNonSuspendingAsync } from "~/lib/create-non-suspending-async.js";
import { useHerdrStatuses } from "../ticket/herdr-statuses-context.js";
import {
	isGutterPath,
	reviewLineRangeBetween,
	reviewLineRangeFromSelection,
} from "./diff-review-selection.js";
import {
	enqueueReviewPrompt,
	getReviewPromptQueue,
	getReviewScopes,
	getReviewSnapshot,
	markReviewLinesReviewed,
	retryReviewPrompt,
} from "./diff-review-api.js";

const SCOPE_LABELS: Record<DiffScope, string> = {
	all: "All Changes",
	branch: "Branch Changes",
	working: "Uncommitted Changes",
	"last-commit": "Last Commit Changes",
};

type FileReviewStatus = "unreviewed" | "reviewed";

interface ActiveSelection {
	range: ReviewLineRange;
	snapshot: ReviewPromptSnapshot;
}

interface ActiveComposer {
	selection?: ActiveSelection;
}

function fileName(filePath: string): string {
	return filePath.split("/").at(-1) ?? filePath;
}

function fileDirectory(filePath: string): string {
	const parts = filePath.split("/");
	return parts.slice(0, -1).join("/");
}

function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

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

function selectionLabel(selection: ActiveSelection): string {
	const snapshot = selection.snapshot;
	const oldRange = snapshot.oldRange
		? `old ${snapshot.oldRange.start}-${snapshot.oldRange.end}`
		: "";
	const newRange = snapshot.newRange
		? `new ${snapshot.newRange.start}-${snapshot.newRange.end}`
		: "";
	return `${snapshot.filePath} · ${[oldRange, newRange].filter(Boolean).join(" · ")}`;
}

function ReviewStateIcon(props: { status: FileReviewStatus }) {
	return (
		<Show
			when={props.status === "reviewed"}
			fallback={
				<CircleQuestionMark size={13} class="text-primary" aria-label="Not reviewed" />
			}
		>
			<Check size={13} class="text-muted-foreground" aria-label="Reviewed" />
		</Show>
	);
}

function DiffSurface(props: {
	file: ReviewFileSnapshot;
	layout: DiffLayout;
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
	let surfaceRoot: ParentNode | undefined;
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
					root as ShadowRoot | HTMLElement,
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
		if (typeof IntersectionObserver === "undefined") {
			for (const row of rows) handleVisible(row);
			return;
		}
		observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) handleVisible(entry.target as HTMLElement);
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
			overflow: "scroll" as const,
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
		const identity = `${props.file.path}\0${props.file.contentHash}\0${props.layout}`;
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

	onMount(() => {
		diff = new FileDiff(options(new Set()));
		render();
		hostRef?.addEventListener("pointerdown", handlePointerDown);
		hostRef?.addEventListener("dragstart", handleDragStart);
		document.addEventListener("dragend", handleDragEnd);
		document.addEventListener("pointerup", handleDocumentPointerUp);
	});
	createEffect(() => {
		props.file.contentHash;
		props.layout;
		render();
	});
	createEffect(() => {
		const range = props.selection;
		diff?.setSelectedLines(range ? { ...range } : null, { notify: false });
	});
	createEffect(() => {
		props.jumpTarget;
		applyJump();
	});
	onCleanup(() => {
		hostRef?.removeEventListener("pointerdown", handlePointerDown);
		hostRef?.removeEventListener("dragstart", handleDragStart);
		document.removeEventListener("dragend", handleDragEnd);
		document.removeEventListener("pointerup", handleDocumentPointerUp);
		observer?.disconnect();
		diff?.cleanUp();
	});

	return (
		<div
			ref={hostRef}
			class="min-w-0 rounded-md border border-border bg-background"
			data-testid="diff-review-file-diff"
		/>
	);
}

function FileTree(props: {
	files: ReviewFileSnapshot[];
	activePath: string;
	statusFor(file: ReviewFileSnapshot): FileReviewStatus;
	onSelect(filePath: string): void;
}) {
	return (
		<nav
			class="min-h-0 w-[270px] shrink-0 overflow-auto border-r border-border bg-card/35 p-3"
			aria-label="Changed files"
			data-testid="diff-review-file-tree"
		>
			<div class="mb-3 px-2 font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground">
				CHANGED FILES · {props.files.length}
			</div>
			<div class="space-y-1">
				<For each={props.files}>
					{(file) => (
						<button
							type="button"
							class={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${
								props.activePath === file.path
									? "bg-accent text-accent-foreground"
									: "hover:bg-accent/60"
							}`}
							onClick={() => props.onSelect(file.path)}
							data-testid="diff-review-file"
							data-file-path={file.path}
						>
							<Show
								when={!file.binary}
								fallback={<FileWarning size={14} class="mt-0.5 shrink-0 text-warning" />}
							>
								<FileCode2 size={14} class="mt-0.5 shrink-0 text-muted-foreground" />
							</Show>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-1.5">
									<ReviewStateIcon status={props.statusFor(file)} />
									<span class="truncate font-mono text-[11px] font-medium">
										{fileName(file.path)}
									</span>
								</span>
								<Show when={fileDirectory(file.path)}>
									<span class="mt-0.5 block truncate pl-5 font-mono text-[9px] text-muted-foreground">
										{fileDirectory(file.path)}
									</span>
								</Show>
								<span class="mt-1 block pl-5 font-mono text-[9px]">
									<span class="text-success">+{file.additions}</span>
									<span class="ml-2 text-destructive">-{file.deletions}</span>
									<Show when={file.binary}>
										<span class="ml-2 text-warning">BINARY</span>
									</Show>
								</span>
							</span>
						</button>
					)}
				</For>
			</div>
		</nav>
	);
}

function PromptComposer(props: {
	open: boolean;
	selection?: ActiveSelection;
	stale: boolean;
	sending: boolean;
	error?: string;
	queueItems: ReviewPromptQueueItem[];
	agentStatus?: string;
	retryingId?: string;
	feedback: string;
	dragText?: string;
	onFeedbackChange(feedback: string): void;
	onRetry(itemId: string): void;
	onCancel(): void;
	onError(message: string): void;
	onSend(feedback: string): Promise<boolean>;
}) {
	let inputRef: HTMLTextAreaElement | undefined;

	async function copyPrompt(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			props.onError(error instanceof Error ? error.message : String(error));
		}
	}

	createEffect(() => {
		if (!props.open) return;
		props.selection;
		queueMicrotask(() => inputRef?.focus());
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!props.feedback.trim() || props.sending) return;
		await props.onSend(props.feedback.trim());
	}

	return (
		<Show when={props.open}>
			<Portal>
				<form
					class={
						"fixed bottom-6 right-6 w-[min(440px,calc(100vw-3rem))] rounded-lg"
						+ " border border-primary/50 bg-popover p-3 text-popover-foreground shadow-2xl"
					}
					onSubmit={(event) => void submit(event)}
					data-testid="diff-review-composer"
				>
					<ReviewPromptQueueList
						items={props.queueItems}
						retryingId={props.retryingId}
						onRetry={props.onRetry}
					/>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="text-xs font-semibold">
								{props.selection ? "Review selected lines" : "Prompt the Agent"}
							</div>
							<div class="mt-1 truncate font-mono text-[9px] text-primary">
								{props.selection
									? selectionLabel(props.selection)
									: `Herdr Agent: ${props.agentStatus ?? "not started"}`}
							</div>
						</div>
						<Show when={props.dragText}>
							{(text) => (
								<button
									type="button"
									draggable={true}
									class={
										"flex shrink-0 cursor-grab items-center gap-1 rounded-md border"
										+ " border-border px-1.5 py-1 text-[9px] text-muted-foreground"
										+ " hover:bg-accent active:cursor-grabbing"
									}
									title="Copy this Review Prompt, or drag it into another window"
									onDragStart={(event) => setPromptDragData(event, text(), props.onError)}
									onClick={() => void copyPrompt(text())}
									data-testid="diff-review-drag-prompt"
								>
									<GripVertical size={12} />
									Copy or drag
								</button>
							)}
						</Show>
						<button
							type="button"
							class="btn-ghost-icon h-6 w-6 shrink-0"
							aria-label="Close Review Prompt composer"
							onClick={props.onCancel}
						>
							<X size={13} />
						</button>
					</div>
					<textarea
						ref={inputRef}
						class="input mt-3 min-h-[92px] resize-y text-xs"
						placeholder={props.selection
							? "What should the Agent change here?"
							: "What should the Agent do next?"}
						value={props.feedback}
						onInput={(event) => props.onFeedbackChange(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								props.onCancel();
							} else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
								event.preventDefault();
								event.currentTarget.form?.requestSubmit();
							}
						}}
						data-testid="diff-review-composer-input"
					/>
					<Show when={props.stale}>
						<div
							class={
								"mt-2 flex gap-2 rounded-md border border-warning/40 bg-warning/10"
								+ " px-2 py-1.5 text-[10px] text-warning"
							}
							role="status"
							data-testid="diff-review-stale-warning"
						>
							<AlertTriangle size={13} class="shrink-0" />
							The selected content changed. The original snapshot will still be sent.
						</div>
					</Show>
					<Show when={props.error}>
						<div class="mt-2 text-[10px] text-destructive" role="alert">
							{props.error}
						</div>
					</Show>
					<div class="mt-3 flex items-center justify-between">
						<span class="font-mono text-[9px] text-muted-foreground">
							Enter adds a line · Ctrl/Cmd+Enter sends
						</span>
						<button
							type="submit"
							class="btn-primary btn-sm gap-1.5"
							disabled={!props.feedback.trim() || props.sending}
							data-testid="diff-review-composer-send"
						>
							<Send size={12} />
							Send
						</button>
					</div>
				</form>
			</Portal>
		</Show>
	);
}

function queueStateLabel(item: ReviewPromptQueueItem): string {
	if (item.state === "delivering") return "Delivering";
	if (item.state === "sent") return "Sent";
	if (item.state === "error") return "Delivery failed";
	return "Waiting";
}

function ReviewPromptQueueList(props: {
	items: ReviewPromptQueueItem[];
	retryingId?: string;
	onRetry(itemId: string): void;
}) {
	let bodyRef: HTMLDivElement | undefined;
	createEffect(() => {
		props.items.length;
		queueMicrotask(() => {
			if (bodyRef) bodyRef.scrollTop = 0;
		});
	});
	return (
		<Show when={props.items.length > 0}>
			<section
				class="mb-3 rounded-md border border-border bg-card"
				aria-label="Review Prompt Queue"
				data-testid="diff-review-queue"
			>
				<div class="flex items-center gap-2 px-2.5 py-1.5">
					<span class="font-mono text-[9px] font-bold tracking-[0.12em]">
						REVIEW PROMPT QUEUE
					</span>
					<span class="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px]">
						{props.items.length}
					</span>
				</div>
				<div
					ref={bodyRef}
					class="max-h-[132px] overflow-y-auto border-t border-border"
				>
					<For each={props.items}>
						{(item, index) => (
							<article
								class={
									"flex items-start gap-2 border-b border-border"
									+ " px-2.5 py-1.5 last:border-b-0"
								}
								data-testid="diff-review-queue-item"
							>
								<div class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
									<Show when={item.state === "sent"}>
										<Check size={12} class="text-success" />
									</Show>
									<Show when={item.state === "delivering"}>
										<LoaderCircle size={12} class="animate-spin text-primary" />
									</Show>
									<Show when={item.state === "error"}>
										<AlertTriangle size={12} class="text-destructive" />
									</Show>
									<Show when={item.state === "waiting"}>
										<span class="font-mono text-[9px] text-muted-foreground">
											{index() + 1}
										</span>
									</Show>
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="truncate font-mono text-[9px] text-primary">
											{item.snapshot?.filePath ?? "Agent prompt"}
										</span>
										<span class="shrink-0 text-[9px] text-muted-foreground">
											{queueStateLabel(item)}
										</span>
									</div>
									<p class="mt-0.5 line-clamp-2 text-[10px]">{item.feedback}</p>
									<Show when={item.error}>
										<p class="mt-0.5 text-[9px] text-destructive">{item.error}</p>
									</Show>
								</div>
								<Show when={item.state === "error" && index() === 0}>
									<button
										type="button"
										class="btn-secondary btn-sm shrink-0 gap-1.5"
										disabled={props.retryingId === item.id}
										onClick={() => props.onRetry(item.id)}
										data-testid="diff-review-queue-retry"
									>
										<RotateCcw size={12} />
										Retry
									</button>
								</Show>
							</article>
						)}
					</For>
				</div>
			</section>
		</Show>
	);
}

function DiffLoadError(props: { error: unknown; onRetry(): void }) {
	const message = () => props.error instanceof Error ? props.error.message : String(props.error);
	return (
		<div class="flex h-full items-center justify-center p-8" role="alert">
			<div class="max-w-xl rounded-lg border border-destructive/40 bg-card p-5">
				<div class="flex items-center gap-2 font-medium">
					<AlertTriangle size={17} class="text-destructive" />
					Diff Scope could not be calculated
				</div>
				<p class="mt-2 whitespace-pre-wrap text-sm text-destructive">{message()}</p>
				<button type="button" class="btn-secondary btn-sm mt-4" onClick={props.onRetry}>
					Retry
				</button>
			</div>
		</div>
	);
}

export default function DiffReview(props: {
	projectSlug: string;
	projectName: string;
	ticket: TicketInfo;
	onClose(): void;
}) {
	const herdrStatus = useHerdrStatuses();
	const [scope, setScope] = createSignal<DiffScope>();
	const [pace, setPace] = createSignal<ReviewPace>("live");
	const [layout, setLayout] = createSignal<DiffLayout>("split");
	const [activePath, setActivePath] = createSignal("");
	const [composer, setComposer] = createSignal<ActiveComposer>();
	const [feedback, setFeedback] = createSignal("");
	const [reviewedLineIds, setReviewedLineIds] = createSignal(new Set<string>());
	const [sendError, setSendError] = createSignal<string>();
	const [sending, setSending] = createSignal(false);
	const [refreshing, setRefreshing] = createSignal(false);
	const [retryingId, setRetryingId] = createSignal<string>();
	const [reviewError, setReviewError] = createSignal<string>();
	const [jumpTarget, setJumpTarget] = createSignal<ReviewChangeLocation>();
	const persistedLines = new Set<string>();
	const pendingLines = new Map<string, string>();
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	let scrollRef: HTMLDivElement | undefined;

	const scopes = createNonSuspendingAsync(() =>
		getReviewScopes(props.projectSlug, props.ticket.folderName));
	const snapshot = createNonSuspendingAsync(async () => {
		const selected = scope();
		if (!selected) return undefined;
		return await getReviewSnapshot(props.projectSlug, props.ticket.folderName, selected);
	});
	const queue = createNonSuspendingAsync(() =>
		getReviewPromptQueue(props.projectSlug, props.ticket.folderName));
	const files = createMemo<ReviewFileSnapshot[]>((previous) =>
		reuseUnchangedFiles(previous, snapshot()?.files ?? []), []);
	const selection = () => composer()?.selection;

	createEffect(() => {
		const available = scopes();
		if (!available || scope()) return;
		setScope(available[0]);
	});

	createEffect(() => {
		const current = snapshot();
		if (!current) return;
		setReviewedLineIds((existing) => new Set([
			...existing,
			...current.reviewedLineIds,
		]));
		const currentPath = activePath();
		if (!current.files.some((file) => file.path === currentPath)) {
			setActivePath(current.files[0]?.path ?? "");
			setComposer();
		}
	});

	createEffect(() => {
		if (pace() !== "live") return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const scheduleNext = () => {
			if (disposed) return;
			timer = setTimeout(() => {
				void revalidate("diff-review-snapshot")
					.catch((error: unknown) => {
						setReviewError(error instanceof Error ? error.message : String(error));
					})
					.then(scheduleNext);
			}, 1_200);
		};
		scheduleNext();
		onCleanup(() => {
			disposed = true;
			if (timer !== undefined) clearTimeout(timer);
		});
	});

	createEffect(() => {
		const sentItems = queue()?.items.filter((item) => item.state === "sent") ?? [];
		if (sentItems.length === 0) return;
		const delay = Math.max(
			0,
			Math.min(...sentItems.map((item) =>
				Date.parse(item.sentAt ?? "") + 2_000 - Date.now())),
		);
		const timer = setTimeout(() => void revalidate("diff-review-queue"), delay + 20);
		onCleanup(() => clearTimeout(timer));
	});

	const activeFile = createMemo(() =>
		files().find((file) => file.path === activePath()));
	const scopeLabel = () => {
		const selected = scope();
		return selected ? SCOPE_LABELS[selected] : "changes";
	};
	const unseenChanges = createMemo(() =>
		unreviewedChangeCount(files(), reviewedLineIds()));
	const selectionStale = createMemo(() => {
		const selected = selection();
		if (!selected) return false;
		const file = files().find((candidate) =>
			candidate.path === selected.snapshot.filePath);
		return !reviewSelectionStillExists(file, selected.snapshot);
	});

	createEffect(on(composer, () => setFeedback("")));

	// The text every drag source hands to another window: identical to what the
	// queue delivers to the Agent for the same Review Selection.
	function promptDragText(): string | undefined {
		const selected = selection();
		if (!selected) return undefined;
		return renderReviewPrompt(
			{ feedback: feedback().trim(), snapshot: selected.snapshot },
			{ stale: selectionStale() },
		);
	}

	function statusFor(file: ReviewFileSnapshot): FileReviewStatus {
		return fileIsReviewed(file, reviewedLineIds()) ? "reviewed" : "unreviewed";
	}

	function flushReviewedLines() {
		flushTimer = undefined;
		const batch = [...pendingLines].map(([id, path]) => ({ id, path }));
		pendingLines.clear();
		if (batch.length === 0) return;
		void markReviewLinesReviewed(
			props.projectSlug,
			props.ticket.folderName,
			batch,
		).then((result) => {
			if (result.ok) return;
			for (const line of batch) persistedLines.delete(line.id);
			setReviewError(result.message);
		});
	}

	function onChangedLineVisible(lineId: string) {
		const file = activeFile();
		if (!file) return;
		setReviewedLineIds((current) =>
			current.has(lineId) ? current : new Set([...current, lineId]));
		if (persistedLines.has(lineId)) return;
		persistedLines.add(lineId);
		pendingLines.set(lineId, file.path);
		if (flushTimer === undefined) flushTimer = setTimeout(flushReviewedLines, 400);
	}

	onCleanup(() => {
		if (flushTimer !== undefined) clearTimeout(flushTimer);
		flushReviewedLines();
	});

	function selectLines(range: SelectedLineRange | null) {
		if (!range) {
			setComposer();
			return;
		}
		const file = activeFile();
		const current = snapshot();
		const currentScope = scope();
		if (!file || !current || !currentScope || file.binary) return;
		try {
			setComposer({
				selection: {
					range,
					snapshot: buildReviewPromptSnapshot(file, range, currentScope, current.revision),
				},
			});
			setSendError();
		} catch (error) {
			setReviewError(error instanceof Error ? error.message : String(error));
		}
	}

	async function sendFeedback(feedback: string): Promise<boolean> {
		if (!composer() || sending()) return false;
		setSending(true);
		setSendError();
		try {
			const result = await enqueueReviewPrompt(
				props.projectSlug,
				props.ticket.folderName,
				feedback,
				selection()?.snapshot,
			);
			if (!result.ok) {
				setSendError(result.message);
				return false;
			}
			setFeedback("");
			await revalidate("diff-review-queue");
			return true;
		} finally {
			setSending(false);
		}
	}

	async function retry(itemId: string) {
		if (retryingId()) return;
		setRetryingId(itemId);
		try {
			const result = await retryReviewPrompt(
				props.projectSlug,
				props.ticket.folderName,
				itemId,
			);
			if (!result.ok) setReviewError(result.message);
			await revalidate("diff-review-queue");
		} finally {
			setRetryingId();
		}
	}

	function jumpToNextChange() {
		const location = nextUnreviewedChange(files(), reviewedLineIds(), activePath());
		if (!location) return;
		if (location.filePath !== activePath()) {
			setActivePath(location.filePath);
			setComposer();
		}
		setJumpTarget(location);
	}

	async function refresh() {
		if (refreshing()) return;
		setRefreshing(true);
		try {
			await revalidate("diff-review-snapshot");
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<div class="flex h-full min-h-0 flex-col bg-background" data-testid="diff-review">
			<header
				class={
					"flex h-[54px] shrink-0 items-center justify-between gap-4"
					+ " border-b border-border bg-card/55 px-4"
				}
			>
				<div class="flex min-w-0 items-center gap-3">
					<GitCompareArrows size={18} class="shrink-0 text-primary" />
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold">Diff Review · {props.ticket.number}</div>
						<div class="truncate font-mono text-[10px] text-muted-foreground">
							{props.projectName} · {props.ticket.title}
						</div>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<label class="relative">
						<span class="sr-only">Diff Scope</span>
						<select
							class="input input-sm w-[180px] appearance-none pr-8 text-xs"
							value={scope() ?? ""}
							onChange={(event) => {
								setScope(event.currentTarget.value as DiffScope);
								setComposer();
							}}
							data-testid="diff-review-scope"
						>
							<For each={scopes() ?? []}>
								{(value) => <option value={value}>{SCOPE_LABELS[value]}</option>}
							</For>
						</select>
						<ChevronDown
							size={13}
							class={
								"pointer-events-none absolute right-2.5 top-1/2"
								+ " -translate-y-1/2 text-muted-foreground"
							}
						/>
					</label>
					<div class="flex rounded-md border border-input bg-background p-0.5">
						<button
							type="button"
							class={`h-7 rounded-sm px-2.5 font-mono text-[11px] ${
								pace() === "live"
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground"
							}`}
							onClick={() => setPace("live")}
							aria-pressed={pace() === "live"}
							data-testid="diff-review-pace-live"
						>
							<Play size={11} class="mr-1 inline" />
							Live Review
						</button>
						<button
							type="button"
							class={`h-7 rounded-sm px-2.5 font-mono text-[11px] ${
								pace() === "step-by-step"
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground"
							}`}
							onClick={() => setPace("step-by-step")}
							aria-pressed={pace() === "step-by-step"}
							data-testid="diff-review-pace-step"
						>
							<Pause size={11} class="mr-1 inline" />
							Step-by-Step
						</button>
					</div>
					<button
						type="button"
						class="btn-secondary btn-sm gap-1.5"
						disabled={unseenChanges() === 0}
						onClick={jumpToNextChange}
						title="Scroll to the next change you have not seen yet"
						data-testid="diff-review-next-change"
					>
						<ArrowDownToLine size={12} />
						Next Change
						<span class="font-mono text-[9px] text-muted-foreground">
							{unseenChanges()}
						</span>
					</button>
					<button
						type="button"
						class="btn-secondary btn-sm gap-1.5"
						onClick={() => {
							setComposer({});
							setSendError();
						}}
						title="Send the Agent a prompt without selecting lines"
						data-testid="diff-review-prompt-agent"
					>
						<Send size={12} />
						Prompt Agent
					</button>
					<span
						class="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground"
						data-testid="diff-review-agent-status"
					>
						{herdrStatus(props.ticket.folderName) ?? "no agent"}
					</span>
					<button
						type="button"
						class="btn-secondary btn-sm gap-1.5"
						disabled={refreshing()}
						onClick={() => void refresh()}
						data-testid="diff-review-refresh"
					>
						<RefreshCw size={12} />
						Refresh
					</button>
					<div class="flex rounded-md border border-input bg-background p-0.5">
						<For each={["split", "unified"] as const}>
							{(value) => (
								<button
									type="button"
									class={`h-7 rounded-sm px-2 font-mono text-[10px] ${
										layout() === value
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground"
									}`}
									onClick={() => setLayout(value)}
									aria-pressed={layout() === value}
								>
									{value === "split" ? "Split" : "Unified"}
								</button>
							)}
						</For>
					</div>
					<button
						type="button"
						class="btn-ghost-icon h-8 w-8"
						aria-label="Close Diff Review"
						onClick={props.onClose}
						data-testid="diff-review-close"
					>
						<X size={16} />
					</button>
				</div>
			</header>

			<ErrorBoundary fallback={(error) => (
				<DiffLoadError
					error={error}
					onRetry={() => void revalidate("diff-review-snapshot")}
				/>
			)}>
				<Show
					when={snapshot()}
					fallback={
						<div class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
							<LoaderCircle size={16} class="mr-2 animate-spin" />
							Calculating {scopeLabel()}...
						</div>
					}
				>
					<Show
						when={files().length > 0}
						fallback={
							<div
								class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
								data-testid="diff-review-empty"
							>
								<Check size={28} class="mb-3 text-muted-foreground" />
								<p class="font-medium">No {scopeLabel().toLowerCase()}</p>
								<p class="mt-1 text-sm text-muted-foreground">
									Refresh to reread this Diff Scope from Git.
								</p>
							</div>
						}
					>
						<div class="flex min-h-0 flex-1">
							<FileTree
								files={files()}
								activePath={activePath()}
								statusFor={statusFor}
								onSelect={(filePath) => {
									setActivePath(filePath);
									setComposer();
								}}
							/>
							<div
								ref={scrollRef}
								class="min-h-0 min-w-0 flex-1 overflow-auto p-4"
								data-testid="diff-review-scroll"
							>
								<Show when={activeFile()}>
									{(file) => (
										<>
											<div class="mb-3 flex items-center justify-between">
												<div class="min-w-0">
													<div class="truncate font-mono text-xs font-semibold">
														{file().path}
													</div>
													<div class="mt-1 text-[10px] text-muted-foreground">
														{file().changeType} · {formatBytes(file().byteSize)}
													</div>
												</div>
												<ReviewStateIcon status={statusFor(file())} />
											</div>
											<Show
												when={!file().binary}
												fallback={
													<div
														class={
															"rounded-lg border border-border"
															+ " bg-card p-8 text-center"
														}
														data-testid="diff-review-binary"
													>
														<FileWarning size={24} class="mx-auto text-warning" />
														<p class="mt-3 font-medium">Binary file</p>
														<p class="mt-1 text-sm text-muted-foreground">
															Line review is unavailable for this file.
														</p>
													</div>
												}
											>
												<Show
													when={file().hunks.length > 0}
													fallback={
														<div
															class={
																"rounded-lg border border-border"
																+ " bg-card p-8 text-center"
															}
														>
															This file changed without a text-content diff.
														</div>
													}
												>
													<DiffSurface
														file={file()}
														layout={layout()}
														selection={selection()?.range}
														jumpTarget={jumpTarget()}
														scrollRoot={() => scrollRef}
														onSelect={selectLines}
														onJumpApplied={() => setJumpTarget()}
														onChangedLineVisible={onChangedLineVisible}
														onError={setReviewError}
														dragText={promptDragText}
													/>
												</Show>
											</Show>
										</>
									)}
								</Show>
							</div>
						</div>
					</Show>
				</Show>
			</ErrorBoundary>

			<Show when={reviewError()}>
				<div
					class={
						"flex shrink-0 items-center justify-between border-t"
						+ " border-destructive/40 bg-destructive/10 px-4 py-2"
						+ " text-xs text-destructive"
					}
					role="alert"
				>
					<span>{reviewError()}</span>
					<button
						type="button"
						class="btn-ghost-icon h-6 w-6"
						aria-label="Dismiss error"
						onClick={() => setReviewError()}
					>
						<X size={12} />
					</button>
				</div>
			</Show>

			<PromptComposer
				open={composer() !== undefined}
				selection={selection()}
				stale={selectionStale()}
				feedback={feedback()}
				dragText={promptDragText()}
				onFeedbackChange={setFeedback}
				sending={sending()}
				error={sendError()}
				queueItems={queue()?.items ?? []}
				agentStatus={herdrStatus(props.ticket.folderName)}
				retryingId={retryingId()}
				onRetry={(itemId) => void retry(itemId)}
				onCancel={() => {
					setComposer();
					setSendError();
				}}
				onError={setSendError}
				onSend={sendFeedback}
			/>
		</div>
	);
}
