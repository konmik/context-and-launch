import type { SelectedLineRange } from "@pierre/diffs";
import { revalidate } from "@solidjs/router";
import {
	Errored,
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	useContext,
	onSettled,
	onCleanup,
} from "solid-js";
import { AlertTriangle } from "~/components/ui/icons.js";
import { ArrowDownToLine } from "~/components/ui/icons.js";
import { Check } from "~/components/ui/icons.js";
import { ChevronDown } from "~/components/ui/icons.js";
import { ChevronRight } from "~/components/ui/icons.js";
import { CircleQuestionMark } from "~/components/ui/icons.js";
import { FileCode2 } from "~/components/ui/icons.js";
import { FileWarning } from "~/components/ui/icons.js";
import { FolderOpen } from "~/components/ui/icons.js";
import { GitCompareArrows } from "~/components/ui/icons.js";
import { LoaderCircle } from "~/components/ui/icons.js";
import { Pause } from "~/components/ui/icons.js";
import { Play } from "~/components/ui/icons.js";
import { RefreshCw } from "~/components/ui/icons.js";
import { Send } from "~/components/ui/icons.js";
import { WrapText } from "~/components/ui/icons.js";
import { X } from "~/components/ui/icons.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type {
	DiffLayout,
	DiffLineOverflow,
	DiffScope,
	ReviewFileSnapshot,
	ReviewPace,
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
import { useHerdrStatuses } from "../ticket/herdr-statuses-context.js";
import { LauncherConfigContext } from '../launcher/shared-launcher-config-storage.js';
import { ProjectLauncherConfigContext } from '../launcher/project-launcher-config-storage.js';
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js';
import { DiffReviewContext, createReviewedLineTracker } from "./diff-review-storage.js";
import { createStoredConfig } from '~/util/stored-config.js';
import { readDiffReviewState, saveDiffReviewState, releaseDiffReviewState } from './diff-review-state-api.js';
import {
	enqueueReviewPrompt,
	getReviewAgentStatus,
	getReviewSnapshot,
} from "./diff-review-api.js";
import {
	buildDiffReviewFileTree,
	diffReviewFilePathsInTreeOrder,
	type DiffReviewFileTreeNode,
} from "./diff-review-file-tree.js";
import { buildFileTypeTotals } from "./diff-review-file-type-totals.js";
import DiffSurface from "./DiffSurface.js";
import ReviewPromptComposer, { type ActiveSelection } from "./ReviewPromptComposer.js";
import ReviewPromptQueueList from "./ReviewPromptQueueList.js";

const SCOPE_LABELS = {
	all: "All Changes",
	branch: "Branch Changes",
	working: "Uncommitted Changes",
	"last-commit": "Last Commit Changes",
} satisfies Record<DiffScope, string>;

function isDiffScope(value: string): value is DiffScope {
	return Object.hasOwn(SCOPE_LABELS, value);
}

const TREE_WIDTH_DEFAULT = 270;
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;

type FileReviewStatus = "unreviewed" | "reviewed";

interface ActiveComposer {
	selection?: ActiveSelection;
}

function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function reuseFilePaths(
	previous: string[],
	files: ReviewFileSnapshot[],
): string[] {
	const current = files.map((file) => file.path);
	return current.length === previous.length
		&& current.every((filePath, index) => filePath === previous[index])
		? previous
		: current;
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

function FileTreeNodes(props: {
	nodes: DiffReviewFileTreeNode[];
	activePath: string;
	collapsedDirectoryPaths: ReadonlySet<string>;
	fileForPath(filePath: string): ReviewFileSnapshot | undefined;
	statusFor(file: ReviewFileSnapshot): FileReviewStatus;
	onToggleDirectory(directoryPath: string): void;
	onSelect(filePath: string): void;
}) {
	return (
		<ul class="space-y-0.5">
			<For each={props.nodes}>
				{(node) => {
					if (node.kind === "directory") {
						const collapsed = () => props.collapsedDirectoryPaths.has(node.directoryPath);
						return (
							<li>
								<button
									type="button"
									class={
										"flex w-full items-center gap-1 px-2 py-1 font-mono text-[10px]"
										+ " font-medium text-muted-foreground"
										+ " hover:bg-accent/60"
									}
									onClick={() => props.onToggleDirectory(node.directoryPath)}
									aria-expanded={!collapsed() ? "true" : "false"}
									data-testid="diff-review-directory"
									data-directory-path={node.directoryPath}
								>
									<Show
										when={!collapsed()}
										fallback={<ChevronRight size={11} class="shrink-0" />}
									>
										<ChevronDown size={11} class="shrink-0" />
									</Show>
									<FolderOpen size={13} class="shrink-0" />
									<span class="whitespace-nowrap">{node.name}</span>
								</button>
								<Show when={!collapsed()}>
									<div class="ml-3 border-l border-border/70 pl-1">
										<FileTreeNodes {...props} nodes={node.children} />
									</div>
								</Show>
							</li>
						);
					}
					const file = () => props.fileForPath(node.filePath);
					return (
						<Show when={file()}>
							{(current) => (
								<li>
									<button
										type="button"
										class={`flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left ${
											props.activePath === node.filePath
												? "bg-accent text-accent-foreground"
												: "hover:bg-accent/60"
										}`}
										onClick={() => props.onSelect(node.filePath)}
										data-testid="diff-review-file"
										data-file-path={node.filePath}
										title={node.filePath}
									>
										<Show
											when={!current().binary}
											fallback={
												<FileWarning size={13} class="mt-0.5 shrink-0 text-warning" />
											}
										>
											<FileCode2 size={13} class="mt-0.5 shrink-0 text-muted-foreground" />
										</Show>
										<span class="min-w-max flex-1">
											<span class="flex items-center gap-1.5 whitespace-nowrap">
												<ReviewStateIcon status={props.statusFor(current())} />
												<span class="font-mono text-[10px] font-medium">
													{node.name}
												</span>
											</span>
											<span class="mt-0.5 block whitespace-nowrap pl-[19px] font-mono text-[9px]">
												<span class="text-success">+{current().additions}</span>
												<span class="ml-2 text-destructive">-{current().deletions}</span>
												<Show when={current().binary}>
													<span class="ml-2 text-warning">BINARY</span>
												</Show>
											</span>
										</span>
									</button>
								</li>
							)}
						</Show>
					);
				}}
			</For>
		</ul>
	);
}

function FileTree(props: {
	files: ReviewFileSnapshot[];
	nodes: DiffReviewFileTreeNode[];
	loadedScope?: DiffScope;
	activePath: string;
	width: number;
	statusFor(file: ReviewFileSnapshot): FileReviewStatus;
	onSelect(filePath: string): void;
}) {
	const [collapsedDirectoryPaths, setCollapsedDirectoryPaths] = createSignal(
		new Set<string>(),
	);
	const fileByPath = createMemo(() => new Map(
		props.files.map((file) => [file.path, file]),
	));
	const totalsByFileType = createMemo(() => buildFileTypeTotals(props.files));
	function toggleDirectory(directoryPath: string) {
		setCollapsedDirectoryPaths((current) => {
			const next = new Set(current);
			if (next.has(directoryPath)) next.delete(directoryPath);
			else next.add(directoryPath);
			return next;
		});
	}
	return (
		<nav
			style={{ width: `${props.width}px` }}
			class="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/35"
			aria-label="Changed files"
			data-testid="diff-review-file-tree"
			data-loaded-scope={props.loadedScope}
		>
			<div class="shrink-0 p-3 pb-0">
				<div class="px-2 font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground">
					CHANGED FILES · {props.files.length}
				</div>
			</div>
			<div
				class="min-h-0 flex-1 overflow-auto p-3 pt-2"
				data-testid="diff-review-file-tree-scroll"
			>
				<FileTreeNodes
					nodes={props.nodes}
					activePath={props.activePath}
					collapsedDirectoryPaths={collapsedDirectoryPaths()}
					fileForPath={(filePath) => fileByPath().get(filePath)}
					statusFor={props.statusFor}
					onToggleDirectory={toggleDirectory}
					onSelect={props.onSelect}
				/>
			</div>
			<footer class="shrink-0 border-t border-border/70 p-3">
				<div class="px-2 font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground">
					LINE CHANGES BY TYPE
				</div>
				<ul class="mt-1.5" data-testid="diff-review-file-type-totals">
					<For each={totalsByFileType()}>
						{(totals) => (
							<li
								class="flex items-baseline justify-between gap-2 px-2 py-0.5 font-mono text-[10px]"
								data-file-type={totals.fileType}
							>
								<span class="min-w-0 truncate text-muted-foreground">{totals.fileType}</span>
								<span class="ml-auto whitespace-nowrap tabular-nums">
									<span class="text-success">+{totals.additions}</span>
									<span class="ml-2 text-destructive">-{totals.deletions}</span>
								</span>
							</li>
						)}
					</For>
				</ul>
			</footer>
		</nav>
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

// What stands in for the files while the selected Diff Scope has none to show:
// Git is still calculating it, or Git answered that it cannot.
function DiffScopeUnavailable(props: {
	error?: string;
	label: string;
	onRetry(): void;
}) {
	return (
		<Show
			when={props.error}
			fallback={
				<div class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
					<LoaderCircle size={16} class="mr-2 animate-spin" />
					Calculating {props.label}...
				</div>
			}
		>
			{(message) => <DiffLoadError error={message()} onRetry={props.onRetry} />}
		</Show>
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
	const [lineOverflow, setLineOverflow] = createSignal<DiffLineOverflow>("scroll");
	const [treeWidth, setTreeWidth] = createSignal(TREE_WIDTH_DEFAULT);
	const [activePath, setActivePath] = createSignal("");
	const [composer, setComposer] = createSignal<ActiveComposer>();
	const [feedback, setFeedback] = createSignal("");
	const [sendError, setSendError] = createSignal<string>();
	const [sending, setSending] = createSignal(false);
	const [refreshing, setRefreshing] = createSignal(false);
	const [savingProfile, setSavingProfile] = createSignal(false);
	const [selectedProfile, setSelectedProfile] = createSignal("");
	const [reviewError, setReviewError] = createSignal<string>();
	const [jumpTarget, setJumpTarget] = createSignal<ReviewChangeLocation>();
	let scrollRef: HTMLDivElement | undefined;
	let scrollFrame: number | undefined;
	const sectionRefs = new Map<string, HTMLElement>();
	const state = createStoredConfig(
		readDiffReviewState.bind(null, props.projectSlug), saveDiffReviewState.bind(null, props.projectSlug),
		releaseDiffReviewState.bind(null, props.projectSlug));
	const agentStatus = createMemo(() =>
		getReviewAgentStatus(props.projectSlug, props.ticket.folderName));
	const worktreeIdentity = createMemo(() => agentStatus().worktreeIdentity);
	const reviewedLines = createMemo(() => {
		const tracker = createReviewedLineTracker({
			state,
			folderName: props.ticket.folderName,
			worktreeIdentity: worktreeIdentity(),
			onError: setReviewError,
		});
		onCleanup(() => void tracker.dispose());
		return tracker;
	});

	const review = createMemo(() =>
		getReviewSnapshot(props.projectSlug, props.ticket.folderName, scope() ?? null));
	const sharedConfig = useContext(LauncherConfigContext)!;
	const projectConfig = useContext(ProjectLauncherConfigContext)!;
	const launcherConfig = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()));
	const agentPresent = () =>
		!!herdrStatus(props.ticket.folderName) || agentStatus()?.agentRunning === true;
	const profileNames = () => launcherConfig()?.profiles.map((profile) => profile.name) ?? [];
	createEffect(launcherConfig, (config) => {
		if (!config) return;
		const names = config.profiles.map((profile) => profile.name);
		setSelectedProfile((current) => {
			if (names.includes(current)) return current;
			const configured = config.columnDefaults[props.ticket.status]?.profileName;
			return configured && names.includes(configured) ? configured : names[0] ?? "";
		});
	});
	const scopes = () => review()?.scopes ?? [];
	// Before the user picks one, the selected Diff Scope is the one the server
	// opened the Diff Review with.
	const selectedScope = () => scope() ?? review()?.scope;
	// Git's answer belongs to the Diff Scope it was calculated for, so an answer
	// for another scope never reaches the screen: while a newly selected scope
	// loads, the Diff Review shows its loading state instead of the files of the
	// scope the user just left. A scope Git cannot calculate answers with an
	// error, and the other scopes stay selectable.
	const scopeAnswer = createMemo(() => {
		const current = review();
		return current && current.scope === selectedScope() ? current : undefined;
	});
	const scopeError = () => scopeAnswer()?.error;
	const scopedSnapshot = () => scopeAnswer()?.snapshot;
	const files = createMemo<ReviewFileSnapshot[]>((previous) =>
		reuseUnchangedFiles(previous ?? [], scopedSnapshot()?.files ?? []), { loadingValue: [] });
	const snapshotFilePaths = createMemo<string[]>((previous) =>
		reuseFilePaths(previous ?? [], files()), { loadingValue: [] });
	const fileTree = createMemo(() => buildDiffReviewFileTree(snapshotFilePaths()));
	const filePaths = createMemo(() => diffReviewFilePathsInTreeOrder(fileTree()));
	const fileByPath = createMemo(() => new Map(
		files().map((file) => [file.path, file]),
	));
	const orderedFiles = createMemo(() => {
		const order = new Map(filePaths().map((filePath, index) => [filePath, index]));
		return [...files()].sort((left, right) =>
			order.get(left.path)! - order.get(right.path)!);
	});
	const selection = () => composer()?.selection;
	const selectionRangeForFile = (filePath: string) => {
		const selected = selection();
		return selected?.snapshot.filePath === filePath ? selected.range : undefined;
	};

	function updateActivePathFromScroll() {
		scrollFrame = undefined;
		const root = scrollRef;
		const currentFiles = orderedFiles();
		if (!root || currentFiles.length === 0) return;
		const rootTop = root.getBoundingClientRect().top;
		let currentPath = currentFiles[0].path;
		for (const file of currentFiles) {
			const section = sectionRefs.get(file.path);
			if (!section?.isConnected) continue;
			if (section.getBoundingClientRect().top > rootTop + 16) break;
			currentPath = file.path;
		}
		if (root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
			currentPath = currentFiles.at(-1)!.path;
		}
		setActivePath(currentPath);
	}

	function scheduleActivePathUpdate() {
		if (scrollFrame !== undefined) return;
		scrollFrame = requestAnimationFrame(updateActivePathFromScroll);
	}

	function scrollToFile(filePath: string) {
		const section = sectionRefs.get(filePath);
		if (!section?.isConnected) return;
		setActivePath(filePath);
		section.scrollIntoView({ block: "start" });
		scheduleActivePathUpdate();
	}

	createEffect(() => [scopedSnapshot(), activePath()] as const, ([current, currentPath]) => {
		if (!current) return;
		if (!current.files.some((file) => file.path === currentPath)) {
			setActivePath(filePaths()[0] ?? "");
		}
		queueMicrotask(scheduleActivePathUpdate);
	});

	createEffect(pace, (currentPace) => {
		if (currentPace !== "live") return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const scheduleNext = () => {
			if (disposed) return;
				timer = setTimeout(() => {
					try { revalidate("diff-review-snapshot"); } catch (error) {
						setReviewError(error instanceof Error ? error.message : String(error));
					}
					scheduleNext();
			}, 1_200);
		};
		scheduleNext();
		return () => {
			disposed = true;
			if (timer !== undefined) clearTimeout(timer);
		};
	});

	// The queue advances on the server as the Agent picks up and finishes each
	// Review Prompt, so the Diff Review rereads it while it is open.
	onSettled(() => {
		const timer = setInterval(() => {
			void state.refresh().then(result => { if (result.type === "Failure") setReviewError(result.error); });
			revalidate("diff-review-agent");
		}, 1_200);
		return () => {
			clearInterval(timer);
			if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
			endTreeResize();
		};
	});

	const scopeLabel = () => {
		const selected = selectedScope();
		return selected ? SCOPE_LABELS[selected] : "changes";
	};
	const unseenChanges = createMemo(() =>
		unreviewedChangeCount(orderedFiles(), reviewedLines().reviewedLineIds()));
	const selectionStale = createMemo(() => {
		const selected = selection();
		if (!selected) return false;
		const file = files().find((candidate) =>
			candidate.path === selected.snapshot.filePath);
		return !reviewSelectionStillExists(file, selected.snapshot);
	});

	function changeComposer(next?: ActiveComposer) {
		setComposer(next);
		setFeedback("");
	}

	// The complete message the queue delivers to the Agent for the current
	// Composer: identical to what the server sends when the user hits Send.
	function completePromptText(): string {
		const selected = selection();
		return renderReviewPrompt(
			{ feedback: feedback().trim(), snapshot: selected?.snapshot },
			{ stale: selectionStale() },
		);
	}

	// The text every drag source hands to another window: identical to what the
	// queue delivers to the Agent for the same Review Selection.
	function promptDragText(): string | undefined {
		if (!selection()) return undefined;
		return completePromptText();
	}

	function promptDragTextForFile(filePath: string): string | undefined {
		return selection()?.snapshot.filePath === filePath ? promptDragText() : undefined;
	}

	function statusFor(file: ReviewFileSnapshot): FileReviewStatus {
		return fileIsReviewed(file, reviewedLines().reviewedLineIds()) ? "reviewed" : "unreviewed";
	}

	function onChangedLineVisible(filePath: string, lineId: string) {
		reviewedLines().markVisible({ id: lineId, path: filePath });
	}

	function selectLines(file: ReviewFileSnapshot, range: SelectedLineRange | null) {
		if (!range) {
			changeComposer();
			return;
		}
		const current = scopedSnapshot();
		if (!current || file.binary) return;
		try {
			setActivePath(file.path);
			changeComposer({
				selection: {
					range,
					snapshot: buildReviewPromptSnapshot(file, range, current.scope, current.revision),
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
				selectedProfile() || null,
				selection()?.snapshot ?? null,
			);
			if (!result.ok) {
				setSendError(result.message);
				return false;
			}
			setFeedback("");
			const refreshed = await state.refresh();
			if (refreshed.type === "Failure") setReviewError(refreshed.error);
			revalidate("diff-review-agent");
			return true;
		} finally {
			setSending(false);
		}
	}

	async function changeProfile(profileName: string) {
		if (savingProfile()) return;
		setSelectedProfile(profileName);
		setSavingProfile(true);
		setSendError();
		try {
			const column = props.ticket.status;
			const result = await projectConfig.update(current => ({
				...current,
				columnDefaults: {
					...current.columnDefaults,
					[column]: {
						templateName: null, checkedSkills: [],
						...(current.columnDefaults && Object.hasOwn(current.columnDefaults, column)
							&& current.columnDefaults[column]),
						profileName,
					},
				},
			}));
			if (result.type === 'Failure') {
				setSendError(result.error);
				return;
			}
		} catch (error) {
			setSendError(error instanceof Error ? error.message : String(error));
		} finally {
			setSavingProfile(false);
		}
	}

	function jumpToNextChange() {
		const location = nextUnreviewedChange(
			orderedFiles(),
			reviewedLines().reviewedLineIds(),
			activePath(),
		);
		if (!location) return;
		setActivePath(location.filePath);
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

	let treeResizeState: { startX: number; startWidth: number } | undefined;

	function onTreeResizePointerMove(event: PointerEvent) {
		if (!treeResizeState) return;
		const next = treeResizeState.startWidth + (event.clientX - treeResizeState.startX);
		setTreeWidth(Math.min(Math.max(next, TREE_WIDTH_MIN), TREE_WIDTH_MAX));
	}

	function endTreeResize() {
		if (!treeResizeState) return;
		treeResizeState = undefined;
		document.body.style.removeProperty("cursor");
		document.body.style.removeProperty("user-select");
		window.removeEventListener("pointermove", onTreeResizePointerMove);
		window.removeEventListener("pointerup", endTreeResize);
		window.removeEventListener("pointercancel", endTreeResize);
	}

	function startTreeResize(event: PointerEvent) {
		event.preventDefault();
		treeResizeState = { startX: event.clientX, startWidth: treeWidth() };
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		window.addEventListener("pointermove", onTreeResizePointerMove);
		window.addEventListener("pointerup", endTreeResize);
		window.addEventListener("pointercancel", endTreeResize);
	}

	function onTreeResizeKeyDown(event: KeyboardEvent) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		const step = event.shiftKey ? 40 : 10;
		setTreeWidth((current) => Math.min(
			Math.max(current + (event.key === "ArrowRight" ? step : -step), TREE_WIDTH_MIN),
			TREE_WIDTH_MAX,
		));
	}

	return (
		<div class="isolate flex h-full min-h-0 flex-col bg-background" data-testid="diff-review">
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
							value={selectedScope() ?? ""}
							onChange={(event) => {
								const value = event.currentTarget.value;
								if (isDiffScope(value)) setScope(value);
								changeComposer();
							}}
							data-testid="diff-review-scope"
						>
							<For each={scopes()}>
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
							aria-pressed={pace() === "live" ? "true" : "false"}
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
							aria-pressed={pace() === "step-by-step" ? "true" : "false"}
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
							changeComposer({});
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
									aria-pressed={layout() === value ? "true" : "false"}
								>
									{value === "split" ? "Split" : "Unified"}
								</button>
							)}
						</For>
					</div>
					<button
						type="button"
						class={`btn-secondary btn-sm gap-1.5 ${
							lineOverflow() === "wrap" ? "bg-accent text-accent-foreground" : ""
						}`}
						onClick={() =>
							setLineOverflow((current) => current === "wrap" ? "scroll" : "wrap")}
						aria-pressed={lineOverflow() === "wrap" ? "true" : "false"}
						title="Wrap long lines instead of scrolling them sideways"
						data-testid="diff-review-wrap-lines"
					>
						<WrapText size={12} />
						Wrap Lines
					</button>
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

			<Errored fallback={(error) => (
				<DiffLoadError
					error={error()}
					onRetry={() => void revalidate("diff-review-snapshot")}
				/>
			)}>
				<Show
					when={scopedSnapshot()}
					fallback={
						<DiffScopeUnavailable
							error={scopeError()}
							label={scopeLabel()}
							onRetry={() => void revalidate("diff-review-snapshot")}
						/>
					}
				>
					<Show
						when={files().length > 0}
						fallback={
							<div
								class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
								data-testid="diff-review-empty"
								data-loaded-scope={selectedScope()}
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
								nodes={fileTree()}
								loadedScope={selectedScope()}
								activePath={activePath()}
								width={treeWidth()}
								statusFor={statusFor}
								onSelect={scrollToFile}
							/>
							<div
								class="w-1.5 shrink-0 cursor-col-resize hover:bg-border/40 active:bg-border/60"
								role="separator"
								aria-orientation="vertical"
								aria-label="Resize changed files panel"
								aria-valuemin={TREE_WIDTH_MIN}
								aria-valuemax={TREE_WIDTH_MAX}
								aria-valuenow={treeWidth()}
						tabindex={0}
								onPointerDown={startTreeResize}
								onKeyDown={onTreeResizeKeyDown}
								data-testid="diff-review-tree-resize"
							/>
							<div
								ref={scrollRef}
								class="min-h-0 min-w-0 flex-1 overflow-auto p-4"
								onScroll={scheduleActivePathUpdate}
								data-testid="diff-review-scroll"
							>
								<div class="space-y-8">
									<For each={filePaths()}>
										{(filePath) => (
											<Show when={fileByPath().get(filePath)}>
												{(file) => (
													<section
														ref={(element) => sectionRefs.set(filePath, element)}
														class="scroll-mt-4"
														data-testid="diff-review-file-section"
														data-file-path={filePath}
													>
														<div
															class={
																"flex items-center justify-between rounded-t-md border"
																+ " border-border bg-card px-3 py-2"
															}
														>
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
																		"rounded-b-md border border-t-0 border-border"
																		+ " bg-card p-8 text-center"
																	}
																	data-testid="diff-review-binary"
																	data-file-path={filePath}
																>
																	<FileWarning
																		size={24}
																		class="mx-auto text-warning"
																	/>
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
																			"rounded-b-md border border-t-0"
																			+ " border-border"
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
																	lineOverflow={lineOverflow()}
																	selection={selectionRangeForFile(filePath)}
																	jumpTarget={jumpTarget()}
																	scrollRoot={() => scrollRef}
																	onSelect={(range) => selectLines(file(), range)}
																	onJumpApplied={() => setJumpTarget()}
																	onChangedLineVisible={(lineId) =>
																		onChangedLineVisible(filePath, lineId)}
																	onError={setReviewError}
																	dragText={() =>
																		promptDragTextForFile(filePath)}
																/>
															</Show>
														</Show>
													</section>
												)}
											</Show>
										)}
									</For>
								</div>
							</div>
						</div>
					</Show>
				</Show>
			</Errored>

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

			<ReviewPromptComposer
				open={composer() !== undefined}
				selection={selection()}
				stale={selectionStale()}
				feedback={feedback()}
				completePrompt={completePromptText()}
				dragText={promptDragText()}
				profileNames={profileNames()}
				selectedProfile={selectedProfile()}
				savingProfile={savingProfile()}
				onFeedbackChange={setFeedback}
				onProfileChange={(profileName) => void changeProfile(profileName)}
				sending={sending()}
				error={sendError()}
				agentStatus={herdrStatus(props.ticket.folderName)}
				agentPresent={agentPresent()}
				onCancel={() => {
					changeComposer();
					setSendError();
				}}
				onError={setSendError}
				onSend={sendFeedback}
			>
				<DiffReviewContext value={state}>
					<ReviewPromptQueueList projectSlug={props.projectSlug}
						folderName={props.ticket.folderName}
						worktreeIdentity={agentStatus().worktreeIdentity} profileName={selectedProfile()} />
				</DiffReviewContext>
			</ReviewPromptComposer>

		</div>
	);
}
