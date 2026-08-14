import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Trash2 from "lucide-solid/icons/trash-2";
import { For, Show, createEffect, createSignal, untrack } from "solid-js";
import type { ReviewPromptQueueItem } from "~/core/diff-review/diff-review-types.js";
import VerticalReveal from "./VerticalReveal.js";

type QueueEntry = { item: ReviewPromptQueueItem; shown: boolean };

export default function ReviewPromptQueueList(props: {
	items: ReviewPromptQueueItem[];
	retryingId?: string;
	removingId?: string;
	onRetry(itemId: string): void;
	onRemove(itemId: string): void;
}) {
	let bodyRef: HTMLDivElement | undefined;
	const [entries, setEntries] = createSignal<QueueEntry[]>([]);
	const itemError = (item: ReviewPromptQueueItem) =>
		item.state === "error" || item.state === "uncertain" ? item.error : undefined;

	createEffect(() => {
		const incoming = props.items;
		const current = untrack(entries);
		const next = incoming.map((item) => ({ item, shown: true }));
		const incomingIds = new Set(incoming.map((item) => item.id));
		for (const entry of current) {
			if (!incomingIds.has(entry.item.id)) next.push({ item: entry.item, shown: false });
		}
		setEntries(next);
	});

	createEffect(() => {
		props.items.length;
		queueMicrotask(() => {
			if (bodyRef) bodyRef.scrollTop = 0;
		});
	});

	return (
		<Show when={entries().length > 0}>
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
					<For each={entries().map((entry) => entry.item.id)}>
						{(id) => {
							const entry = () =>
								entries().find((candidate) => candidate.item.id === id)!;
							return (
								<article
									class="border-b border-border last:border-b-0"
									data-testid="diff-review-queue-item"
								>
									<VerticalReveal
										show={entry().shown}
										onHidden={() => setEntries((list) =>
											list.filter((candidate) => candidate.item.id !== id))}
									>
										<div class="flex items-start gap-2 px-2.5 py-1.5">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2">
													<span class="truncate font-mono text-[9px] text-primary">
														{entry().item.snapshot?.filePath ?? "Agent prompt"}
													</span>
												</div>
												<p class="mt-0.5 line-clamp-2 text-[10px]">
													{entry().item.feedback}
												</p>
												<Show when={itemError(entry().item)}>
													<p class="mt-0.5 text-[9px] text-destructive">
														{itemError(entry().item)}
													</p>
												</Show>
											</div>
											<Show when={
												entry().item.state === "error"
												|| entry().item.state === "uncertain"
											}>
												<button
													type="button"
													class="btn-secondary btn-sm shrink-0 gap-1.5"
													title="Send this Review Prompt to the Agent again"
													disabled={props.retryingId === entry().item.id}
													onClick={() => props.onRetry(entry().item.id)}
													data-testid="diff-review-queue-retry"
												>
													<RotateCcw size={12} />
													Retry
												</button>
											</Show>
											<Show when={
												entry().item.state === "waiting"
												|| entry().item.state === "error"
												|| entry().item.state === "uncertain"
											}>
												<button
													type="button"
													class="btn-ghost-icon h-6 w-6 shrink-0"
													aria-label="Remove this Review Prompt from the queue"
													title="Remove this Review Prompt from the queue"
													disabled={props.removingId === entry().item.id}
													onClick={() => props.onRemove(entry().item.id)}
													data-testid="diff-review-queue-remove"
												>
													<Trash2 size={12} />
												</button>
											</Show>
										</div>
									</VerticalReveal>
								</article>
							);
						}}
					</For>
				</div>
			</section>
		</Show>
	);
}
