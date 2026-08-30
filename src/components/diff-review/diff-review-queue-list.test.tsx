import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "~/test-render.js";
import { createSignal, flush } from "solid-js";
import ReviewPromptQueueList from "./ReviewPromptQueueList.js";
import type { ReviewPromptQueueItem } from "~/core/diff-review/diff-review-types.js";

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

	it("keeps each item on its own DOM node while another item is removed", () => {
		const [items, setItems] = createSignal([
			makeItem({ id: "a", feedback: "alpha" }),
			makeItem({ id: "b", feedback: "beta" }),
		]);
		const { container } = render(() => (
			<ReviewPromptQueueList
				items={items()}
				onRetry={() => {}}
				onRemove={() => {}}
			/>
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
			<ReviewPromptQueueList
				items={items()}
				onRetry={() => {}}
				onRemove={() => {}}
			/>
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
			<ReviewPromptQueueList
				items={items()}
				onRetry={() => {}}
				onRemove={() => {}}
			/>
		));
		expect(container.querySelector('[data-testid="diff-review-queue-remove"]')).toBeTruthy();

		setItems([makeItem({ id: "a", feedback: "alpha updated", state: "sent" })]);
		flush();
		const updated = itemByFeedback(container, "alpha updated");
		expect(updated).toBeTruthy();
		expect(updated!.querySelector('[data-testid="diff-review-queue-remove"]')).toBeNull();
	});
});
