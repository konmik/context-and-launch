import { RotateCcw } from "~/components/ui/icons.js";
import { Trash2 } from "~/components/ui/icons.js";
import { For, Show, createEffect, createSignal, untrack } from "solid-js";
import { revalidate } from "@solidjs/router";
import { retryReviewPrompt } from "./diff-review-api.js";
import type { DiffReviewProjectState, ReviewPromptQueueItem } from "~/core/diff-review/diff-review-types.js";
import type { StoredSignal } from "~/util/stored-signal.js";
import { getReviewTicketState } from "~/core/diff-review/diff-review-types.js";
import VerticalReveal from "./VerticalReveal.js";

type QueueEntry = { item: ReviewPromptQueueItem; shown: boolean };

export default function ReviewPromptQueueList(props: {
	state: StoredSignal<DiffReviewProjectState>;
	projectSlug: string;
	folderName: string;
	worktreeIdentity: string;
	profileName: string;
}) {
	const items = () => getReviewTicketState(props.state.get(), props.folderName, props.worktreeIdentity).queue.items;
	const [retryingId, setRetryingId] = createSignal<string>();
	const [removingId, setRemovingId] = createSignal<string>();
	const [error, setError] = createSignal<string>();

	async function retry(itemId: string) {
		if (retryingId()) return;
		setRetryingId(itemId);
		setError();
		try {
			const result = await retryReviewPrompt(
				props.projectSlug, props.folderName, itemId, props.profileName || null,
			);
			if (!result.ok) setError(result.message);
			const refreshed = await props.state.refresh();
			if (refreshed.type === "Failure") setError(refreshed.error);
			revalidate("diff-review-agent");
		} finally { setRetryingId(); }
	}

	async function remove(itemId: string) {
		if (removingId()) return;
		setRemovingId(itemId);
		setError();
		try {
			const result = await props.state.update(current => {
				const ticket = getReviewTicketState(current, props.folderName, props.worktreeIdentity);
				const item = ticket.queue.items.find(item => item.id === itemId);
				if (!item) throw new Error("That Review Prompt is no longer in the queue.");
				if (!["waiting", "error", "uncertain"].includes(item.state)) {
					throw new Error(`This Review Prompt is already ${item.state} and can no longer be removed.`);
				}
				return { ...current, tickets: { ...current.tickets, [props.folderName]: { ...ticket,
					queue: { ...ticket.queue,
						items: ticket.queue.items.filter(item => item.id !== itemId),
						requestedAgentProfileName: ticket.queue.items[0]?.id === itemId
							? undefined : ticket.queue.requestedAgentProfileName,
					},
				} } };
			});
			if (result.type === "Failure") setError(result.error);
		} finally { setRemovingId(); }
	}
	let bodyRef: HTMLDivElement | undefined;
	const [entries, setEntries] = createSignal<QueueEntry[]>([]);
	const itemError = (item: ReviewPromptQueueItem) =>
		item.state === "error" || item.state === "uncertain" ? item.error : undefined;

	createEffect(items, (incoming) => {
		const current = untrack(entries);
		const next = incoming.map((item) => ({ item, shown: true }));
		const incomingIds = new Set(incoming.map((item) => item.id));
		for (const entry of current) {
			if (!incomingIds.has(entry.item.id)) next.push({ item: entry.item, shown: false });
		}
		setEntries(next);
	});

	createEffect(() => items().length, () => {
		queueMicrotask(() => {
			const body = bodyRef;
			if (body) body.scrollTop = 0;
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
						{items().length}
					</span>
				</div>
				<Show when={error()}><p class="px-2.5 text-xs text-destructive" role="alert">{error()}</p></Show>
				<div
					ref={bodyRef}
					class="max-h-[132px] overflow-y-auto border-t border-border"
				>
					<For each={entries()} keyed={(entry) => entry.item.id}>
						{(entry) => {
							const id = () => entry().item.id;
							return (
								<article
									class="border-b border-border last:border-b-0"
									data-testid="diff-review-queue-item"
								>
									<VerticalReveal
										show={entry().shown}
										onHidden={() => setEntries((list) =>
											list.filter((candidate) => candidate.item.id !== id()))}
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
													disabled={retryingId() === id()}
													onClick={() => void retry(id())}
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
												disabled={removingId() === id()}
												onClick={() => void remove(id())}
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
