import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "~/test-render.js";
import { createMemo, createSignal, flush, type Accessor } from "solid-js";
import ReviewPromptQueueList from "./ReviewPromptQueueList.js";
import type { DiffReviewProjectState, ReviewPromptQueueItem } from "~/core/diff-review/diff-review-types.js";
import { succeed } from "~/util/result.js";
import { createStoredSignal } from "~/util/stored-signal.js";
import { DiffReviewContext, ReviewAgentStatusContext } from './diff-review-storage.js';

function TicketQueue(props: { profileName: string }) {
	return <ReviewAgentStatusContext value={createMemo(() => ({
		worktreeIdentity: 'worktree', agentRunning: false,
	}))}><ReviewPromptQueueList projectSlug="project" folderName="ticket" profileName={props.profileName} />
	</ReviewAgentStatusContext>;
}

function Queue(props: { items: ReviewPromptQueueItem[] }) {
	return <DiffReviewContext value={{
		get: () => ({ version: 2, tickets: {
			ticket: { worktreeIdentity: "worktree", reviewedLines: {}, queue: { items: props.items } },
		} }),
		update: async () => succeed(undefined),
		refresh: async () => succeed(undefined),
	}}><TicketQueue profileName="" />
	</DiffReviewContext>;
}

function makeItem(overrides: {
	id?: string;
	feedback?: string;
	state?: "waiting" | "sent";
}): ReviewPromptQueueItem {
	const base = {
		id: "item",
		createdAt: "2026-08-13T00:00:00.000Z",
		feedback: "Please review this.",
	};
	return overrides.state === "sent"
		? { ...base, ...overrides, state: "sent", sentAt: "2026-08-13T00:01:00.000Z" }
		: { ...base, ...overrides, state: "waiting" };
}

function itemByFeedback(container: HTMLElement, feedback: string) {
  const nodes = [...container.querySelectorAll<HTMLElement>('[data-testid="diff-review-queue-item"]')];
  return nodes.find((node) => node.textContent?.includes(feedback));
}

function fireAnimationEnd(element: Element, animationName: string) {
	const event = new Event("animationend", { bubbles: false });
	Object.defineProperty(event, "animationName", { value: animationName });
	element.dispatchEvent(event);
}

function bodyOf(item: HTMLElement) {
  const body = item.querySelector<HTMLElement>(".vertical-reveal-body");
  if (!body) throw new Error("Expected queue item reveal body");
  return body;
}

describe("ReviewPromptQueueList", () => {
	afterEach(() => cleanup());

	it("removes from the latest queue and clears only the removed head's launch request", async () => {
		let saved: DiffReviewProjectState = { version: 2, tickets: { ticket: {
			worktreeIdentity: "worktree", reviewedLines: {}, queue: {
			items: [makeItem({ id: "a" }), makeItem({ id: "b" })], requestedAgentProfileName: "agent",
		} } } };
		let get!: Accessor<DiffReviewProjectState>;
		const { container } = render(() => {
			const state = createStoredSignal(() => saved, async transform => succeed(saved = transform(saved)));
			get = state.get;
			return <DiffReviewContext value={state}><TicketQueue profileName="agent" /></DiffReviewContext>;
		});
		const buttons = container.querySelectorAll<HTMLButtonElement>('[data-testid="diff-review-queue-remove"]');
		buttons[1].click();
		await expect.poll(() => saved.tickets.ticket.queue.items.map(item => item.id)).toEqual(["a"]);
		expect(saved.tickets.ticket.queue.requestedAgentProfileName).toBe("agent");
		buttons[0].click();
		await expect.poll(() => saved.tickets.ticket.queue.items).toEqual([]);
		expect(saved.tickets.ticket.queue.requestedAgentProfileName).toBeUndefined();
		expect(get().tickets.ticket.queue.items).toEqual([]);
	});

	it("refuses to remove a prompt that started delivery after the last render", async () => {
		let saved: DiffReviewProjectState = { version: 2, tickets: { ticket: {
			worktreeIdentity: "worktree", reviewedLines: {}, queue: {
			items: [makeItem({ id: "a" })],
		} } } };
		const { container } = render(() => {
			const state = createStoredSignal(() => saved, async transform => succeed(saved = transform(saved)));
			return <DiffReviewContext value={state}><TicketQueue profileName="" /></DiffReviewContext>;
		});
		saved = { ...saved, tickets: { ticket: { ...saved.tickets.ticket,
			queue: { items: [{ ...saved.tickets.ticket.queue.items[0],
			state: "delivering", deliveryStartedAt: new Date().toISOString(),
		}] } } } };
		container.querySelector<HTMLButtonElement>('[data-testid="diff-review-queue-remove"]')!.click();
		await expect.poll(() => container.querySelector('[role="alert"]')?.textContent).toContain("already delivering");
		expect(saved.tickets.ticket.queue.items[0].state).toBe("delivering");
	});

	it("keeps each item on its own DOM node while another item is removed", () => {
		const [items, setItems] = createSignal([
			makeItem({ id: "a", feedback: "alpha" }),
			makeItem({ id: "b", feedback: "beta" }),
		]);
		const { container } = render(() => (
			<Queue items={items()} />
		));
		const betaBefore = itemByFeedback(container, "beta");
		expect(betaBefore).toBeTruthy();

		setItems((list) => list.filter((item) => item.id !== "a"));
		flush();
		const alpha = itemByFeedback(container, "alpha");
		expect(alpha).toBeTruthy();
		fireAnimationEnd(bodyOf(alpha!), "vertical-reveal-close");
		flush();

		const betaAfter = itemByFeedback(container, "beta");
		expect(betaAfter).toBeTruthy();
		expect(betaAfter!.isSameNode(betaBefore!)).toBe(true);
	});

	it("collapses every leaving item when several are removed at once", () => {
		const [items, setItems] = createSignal([
			makeItem({ id: "a", feedback: "alpha" }),
			makeItem({ id: "b", feedback: "beta" }),
		]);
		const { container } = render(() => (
			<Queue items={items()} />
		));
		const betaBefore = itemByFeedback(container, "beta");
		expect(betaBefore).toBeTruthy();

		setItems(() => []);
		flush();
		const alpha = itemByFeedback(container, "alpha");
		expect(alpha).toBeTruthy();
		fireAnimationEnd(bodyOf(alpha!), "vertical-reveal-close");
		flush();

		const betaWhileLeaving = itemByFeedback(container, "beta");
		expect(betaWhileLeaving).toBeTruthy();
		expect(betaWhileLeaving!.isSameNode(betaBefore!)).toBe(true);

		fireAnimationEnd(bodyOf(betaWhileLeaving!), "vertical-reveal-close");
		flush();
		expect(container.querySelector('[data-testid="diff-review-queue"]')).toBeNull();
	});

	it("updates an item's content in place when its data changes", () => {
		const [items, setItems] = createSignal([
			makeItem({ id: "a", feedback: "alpha", state: "waiting" }),
		]);
		const { container } = render(() => (
			<Queue items={items()} />
		));
		expect(container.querySelector('[data-testid="diff-review-queue-remove"]')).toBeTruthy();

		setItems([makeItem({ id: "a", feedback: "alpha updated", state: "sent" })]);
		flush();
		const updated = itemByFeedback(container, "alpha updated");
		expect(updated).toBeTruthy();
		expect(updated!.querySelector('[data-testid="diff-review-queue-remove"]')).toBeNull();
	});
});
