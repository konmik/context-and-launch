import { For, Show, createEffect } from "solid-js";
import { Portal } from "@solidjs/web";
import { AlertTriangle } from "~/components/ui/icons.js";
import { GripVertical } from "~/components/ui/icons.js";
import { Send } from "~/components/ui/icons.js";
import { X } from "~/components/ui/icons.js";
import type {
	ReviewLineRange,
	ReviewPromptQueueItem,
	ReviewPromptSnapshot,
} from "~/core/diff-review/diff-review-types.js";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";
import { modEnterHint } from "~/lib/use-mod-enter-submit.js";
import HerdrStatusIcon from "../ticket/HerdrStatusIcon.js";
import ReviewPromptQueueList from "./ReviewPromptQueueList.js";
import VerticalReveal from "./VerticalReveal.js";

export interface ActiveSelection {
	range: ReviewLineRange;
	snapshot: ReviewPromptSnapshot;
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

export default function ReviewPromptComposer(props: {
	open: boolean;
	selection?: ActiveSelection;
	stale: boolean;
	sending: boolean;
	error?: string;
	queueItems: ReviewPromptQueueItem[];
	agentStatus?: HerdrAgentStatus;
	agentPresent: boolean;
	retryingId?: string;
	removingId?: string;
	feedback: string;
	completePrompt: string;
	dragText?: string;
	profileNames: string[];
	selectedProfile: string;
	savingProfile: boolean;
	onFeedbackChange(feedback: string): void;
	onProfileChange(profileName: string): void;
	onRetry(itemId: string): void;
	onRemove(itemId: string): void;
	onCancel(): void;
	onError(message: string): void;
	onSend(feedback: string): Promise<boolean>;
}) {
	let inputRef: HTMLTextAreaElement | undefined;

	const composerAgentStatus = (): HerdrAgentStatus => {
		if (props.agentStatus) return props.agentStatus;
		return props.agentPresent ? "working" : "unknown";
	};

	async function copyPrompt(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			props.onError(error instanceof Error ? error.message : String(error));
		}
	}

	createEffect(() => [props.open, props.selection] as const, ([open]) => {
		if (!open) return;
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
					onKeyDown={(event) => {
						if ((event.ctrlKey || event.metaKey) && event.altKey && event.key === "c") {
							event.preventDefault();
							void copyPrompt(props.completePrompt);
						}
					}}
					data-testid="diff-review-composer"
				>
					<ReviewPromptQueueList
						items={props.queueItems}
						retryingId={props.retryingId}
						removingId={props.removingId}
						onRetry={props.onRetry}
						onRemove={props.onRemove}
					/>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="text-xs font-semibold">
								{props.selection ? "Review selected lines" : "Prompt the Agent"}
							</div>
							<div class="mt-1 truncate font-mono text-[9px] text-primary">
								{props.selection
									? selectionLabel(props.selection!)
									: `Agent: ${props.agentStatus
										?? (props.agentPresent ? "running" : "not started")}`}
							</div>
						</div>
						<button
							type="button"
							class="btn-ghost-icon h-6 w-6 shrink-0"
							aria-label="Close Review Prompt composer"
							onClick={props.onCancel}
						>
							<X size={13} />
						</button>
					</div>
					<div class="mt-2">
						<span class="field-label">Agent</span>
						<div class="mt-1 flex items-center gap-1.5">
							<select
								class="input input-sm flex-1"
								value={props.selectedProfile}
								disabled={
									props.profileNames.length === 0
									|| props.savingProfile
									|| props.agentPresent
								}
								onChange={(event) => props.onProfileChange(event.currentTarget.value)}
								data-testid="diff-review-profile-select"
							>
								<Show when={props.profileNames.length > 0} fallback={
									<option value="">No profiles configured</option>
								}>
									<For each={props.profileNames}>
										{(profileName) => <option value={profileName}>{profileName}</option>}
									</For>
								</Show>
							</select>
							<span class="flex shrink-0 items-center px-1.5">
								<HerdrStatusIcon status={composerAgentStatus()} size={16} />
							</span>
						</div>
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
					<VerticalReveal show={props.stale} class="mt-2">
						<div
							class={
								"flex gap-2 rounded-md border border-warning/40 bg-warning/10"
								+ " px-2 py-1.5 text-[10px] text-warning"
							}
							role="status"
							data-testid="diff-review-stale-warning"
						>
							<AlertTriangle size={13} class="shrink-0" />
							The selected content changed. The original snapshot will still be sent.
						</div>
					</VerticalReveal>
					<Show when={props.error}>
						<div class="mt-2 text-[10px] text-destructive" role="alert">
							{props.error}
						</div>
					</Show>
					<div class="mt-3 flex items-center gap-2">
						<Show when={props.dragText}>
							{(text) => (
								<button
									type="button"
									draggable="true"
									class={
										"flex shrink-0 cursor-grab items-center rounded-md border"
										+ " border-border p-1.5 text-muted-foreground hover:bg-accent"
										+ " active:cursor-grabbing"
									}
									aria-label="Copy this Review Prompt or drag it into another window"
									title="Copy this Review Prompt (Ctrl/Cmd+Alt+C), or drag it into another window"
									onDragStart={(event) => setPromptDragData(event, text(), props.onError)}
									onClick={() => void copyPrompt(text())}
									data-testid="diff-review-drag-prompt"
								>
									<GripVertical size={13} />
								</button>
							)}
						</Show>
						<button
							type="submit"
							class="btn-primary btn-sm ml-auto gap-1.5"
							title={modEnterHint()}
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
