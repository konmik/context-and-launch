import { createSignal, createEffect, on, onCleanup, For, Show } from "solid-js";
import type { TicketInfo, AiEvent, AiStatusResponse } from "~/types.js";

interface AiConsoleTabProps {
	slug: string;
	ticket: TicketInfo;
}

interface ContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	name?: string;
	id?: string;
	input?: Record<string, unknown>;
	caller?: Record<string, unknown>;
}

interface StreamMessage {
	role?: string;
	content?: ContentBlock[];
}

function getMessageContent(data: Record<string, unknown>): ContentBlock[] {
	const msg = data.message as StreamMessage | undefined;
	if (msg?.content && Array.isArray(msg.content)) return msg.content;
	return [];
}

interface RenderedItem {
	kind: "text" | "tool_group" | "user" | "user_queued" | "error" | "clear" | "exit" | "raw";
	content: string;
	count?: number;
}

function groupEvents(events: AiEvent[]): RenderedItem[] {
	const items: RenderedItem[] = [];
	let toolCount = 0;

	function flushTools() {
		if (toolCount > 0) {
			items.push({ kind: "tool_group", content: `${toolCount} tool call${toolCount !== 1 ? "s" : ""}`, count: toolCount });
			toolCount = 0;
		}
	}

	for (const event of events) {
		const data = event.data as Record<string, unknown>;

		if (event.type === "system" || event.type === "rate_limit_event") {
			continue;
		}

		if (event.type === "clear") {
			flushTools();
			items.push({ kind: "clear", content: "Context cleared" });
			continue;
		}

		if (event.type === "process_exit") {
			flushTools();
			items.push({ kind: "exit", content: `Process exited with code ${(data as { code: number | null }).code}` });
			continue;
		}

		if (event.type === "error") {
			flushTools();
			const msg = typeof data.message === "string" ? data.message : JSON.stringify(data);
			items.push({ kind: "error", content: msg });
			continue;
		}

		if (event.type === "user_queued" || event.type === "user_prompt") {
			flushTools();
			items.push({ kind: "user", content: (data as { text: string }).text });
			continue;
		}

		if (event.type === "result") {
			flushTools();
			const text = typeof data.result === "string" ? data.result : "";
			if (text) items.push({ kind: "text", content: text });
			continue;
		}

		if (event.type === "user") {
			continue;
		}

		if (event.type === "assistant") {
			const blocks = getMessageContent(data);
			for (const block of blocks) {
				if (block.type === "text" && block.text) {
					flushTools();
					items.push({ kind: "text", content: block.text });
				} else if (block.type === "thinking") {
					continue;
				} else if (block.type === "tool_use") {
					const name = block.name ?? "tool";
					if (name === "Agent" || name === "WebSearch") {
						flushTools();
						const desc = block.input?.description ?? block.input?.query ?? "";
						items.push({ kind: "text", content: `[${name}] ${desc}` });
					} else {
						toolCount++;
					}
				}
			}
			continue;
		}

		if (event.type === "raw") {
			flushTools();
			const text = typeof data.text === "string" ? data.text : JSON.stringify(data);
			items.push({ kind: "raw", content: text });
		}
	}

	flushTools();
	return items;
}

export default function AiConsoleTab(props: AiConsoleTabProps) {
	const [events, setEvents] = createSignal<AiEvent[]>([]);
	const [status, setStatus] = createSignal<AiStatusResponse>({ running: false, sessionId: null });
	const [inputText, setInputText] = createSignal("");
	const [loading, setLoading] = createSignal(true);
	const [confirmingKill, setConfirmingKill] = createSignal(false);
	const [confirmingReset, setConfirmingReset] = createSignal(false);

	let scrollRef: HTMLDivElement | undefined;
	let userScrolledUp = false;
	let eventSourceAbort: AbortController | null = null;

	function apiBase() {
		return `/api/projects/${props.slug}/board/tickets/${props.ticket.folderName}/ai`;
	}

	function autoScroll() {
		if (scrollRef && !userScrolledUp) {
			scrollRef.scrollTop = scrollRef.scrollHeight;
		}
	}

	function handleScroll() {
		if (!scrollRef) return;
		const threshold = 50;
		userScrolledUp = scrollRef.scrollTop + scrollRef.clientHeight < scrollRef.scrollHeight - threshold;
	}

	async function fetchStatus() {
		try {
			const res = await fetch(`${apiBase()}/status`);
			if (res.ok) {
				const s = await res.json() as AiStatusResponse;
				console.log("[AiConsole] status:", s);
				setStatus(s);
				return s;
			}
		} catch (e) { console.error("[AiConsole] fetchStatus error:", e); }
		return status();
	}

	async function fetchHistory() {
		try {
			const res = await fetch(`${apiBase()}/history`);
			if (res.ok) {
				const body = await res.json() as { events: AiEvent[] };
				console.log("[AiConsole] history:", body.events.length, "events");
				setEvents(body.events);
				return body.events;
			}
		} catch (e) { console.error("[AiConsole] fetchHistory error:", e); }
		return [];
	}

	function connectSSE(sinceSeq: number) {
		if (eventSourceAbort) {
			eventSourceAbort.abort();
		}

		const abort = new AbortController();
		eventSourceAbort = abort;

		let lastSeq = sinceSeq;

		console.log("[AiConsole] connectSSE since=", sinceSeq);
		fetch(`${apiBase()}/stream?since=${sinceSeq}`, { signal: abort.signal })
			.then(async (res) => {
				console.log("[AiConsole] SSE response status=", res.status, "body=", !!res.body);
				if (!res.body) return;
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						console.log("[AiConsole] SSE stream ended");
						break;
					}

					const chunk = decoder.decode(value, { stream: true });
					console.log("[AiConsole] SSE chunk:", chunk.length, "chars");
					buffer += chunk;
					const lines = buffer.split("\n\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						const dataLine = line.trim();
						if (!dataLine.startsWith("data: ")) continue;
						const jsonStr = dataLine.slice(6);
						try {
							const event = JSON.parse(jsonStr) as AiEvent;
							console.log("[AiConsole] SSE event type=", event.type, "seq=", event.seq);
							setEvents(prev => [...prev, event]);
							if (event.seq > lastSeq) {
								lastSeq = event.seq;
							}

							if (event.type === "process_exit") {
								setStatus(s => ({ ...s, running: false }));
							}

							requestAnimationFrame(autoScroll);
						} catch { /* skip malformed */ }
					}
				}

				if (!abort.signal.aborted && status().running) {
					setTimeout(() => connectSSE(lastSeq), 1000);
				}
			})
			.catch((e) => {
				console.error("[AiConsole] SSE fetch error:", e);
				if (!abort.signal.aborted && status().running) {
					setTimeout(() => connectSSE(lastSeq), 2000);
				}
			});
	}

	function disconnectSSE() {
		if (eventSourceAbort) {
			eventSourceAbort.abort();
			eventSourceAbort = null;
		}
	}

	async function initialize() {
		setLoading(true);
		const st = await fetchStatus();
		const hist = await fetchHistory();
		setLoading(false);
		requestAnimationFrame(autoScroll);

		if (st.running) {
			const lastSeq = hist.length > 0 ? (hist[hist.length - 1].seq ?? 0) : 0;
			connectSSE(lastSeq);
		}
	}

	createEffect(
		on(
			() => props.ticket.folderName,
			() => {
				disconnectSSE();
				initialize();
			}
		)
	);

	onCleanup(() => {
		disconnectSSE();
	});

	async function handleRun() {
		try {
			console.log("[AiConsole] handleRun POST", apiBase() + "/run");
			const res = await fetch(`${apiBase()}/run`, { method: "POST" });
			console.log("[AiConsole] handleRun response status=", res.status);
			if (res.ok) {
				const body = await res.json() as { sessionId: string; running: boolean };
				console.log("[AiConsole] handleRun result:", body);
				setStatus({ running: true, sessionId: body.sessionId });
				const lastSeq = events().length > 0 ? (events()[events().length - 1].seq ?? 0) : 0;
				connectSSE(lastSeq);
			} else {
				console.error("[AiConsole] handleRun failed:", res.status, await res.text());
			}
		} catch (e) { console.error("[AiConsole] handleRun error:", e); }
	}

	async function handleSend() {
		const text = inputText().trim();
		if (!text || status().running) return;
		setInputText("");

		try {
			console.log("[AiConsole] send message (auto-resume):", text.slice(0, 100));
			const res = await fetch(`${apiBase()}/run`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: text }),
			});
			if (res.ok) {
				const body = await res.json() as { sessionId: string; running: boolean };
				setStatus({ running: true, sessionId: body.sessionId });
				const lastSeq = events().length > 0 ? (events()[events().length - 1].seq ?? 0) : 0;
				connectSSE(lastSeq);
			}
		} catch (e) { console.error("[AiConsole] send error:", e); }
	}

	async function handleStop() {
		setConfirmingKill(false);
		try {
			await fetch(`${apiBase()}/stop`, { method: "POST" });
			setStatus(s => ({ ...s, running: false }));
		} catch { /* swallow */ }
	}

	async function handleReset() {
		setConfirmingReset(false);
		try {
			const res = await fetch(`${apiBase()}/reset`, { method: "POST" });
			if (res.ok) {
				setStatus({ running: false, sessionId: null });
				setEvents([]);
			}
		} catch { /* swallow */ }
	}

	async function handleClear() {
		try {
			const res = await fetch(`${apiBase()}/clear`, { method: "POST" });
			if (res.ok) {
				const body = await res.json() as { sessionId: string; running: boolean };
				setStatus({ running: true, sessionId: body.sessionId });
				const lastSeq = events().length > 0 ? (events()[events().length - 1].seq ?? 0) : 0;
				connectSSE(lastSeq);
			}
		} catch { /* swallow */ }
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	const rendered = () => groupEvents(events());

	return (
		<div class="flex h-full flex-col">
			<div class="flex items-center gap-2 border-b border-border pb-2 mb-2">
				<Show when={!status().sessionId && !status().running}>
					<button
						onClick={handleRun}
						class="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						Run
					</button>
				</Show>
				<Show when={status().sessionId && !status().running}>
					<button
						onClick={handleRun}
						class="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						Resume
					</button>
				</Show>
				<Show when={status().running}>
					<button
						onClick={() => setConfirmingKill(true)}
						class="inline-flex h-8 items-center justify-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
					>
						Kill
					</button>
				</Show>
				<Show when={status().sessionId && !status().running}>
					<button
						onClick={handleClear}
						class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
					>
						/clear
					</button>
					<button
						onClick={() => setConfirmingReset(true)}
						class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
					>
						New Session
					</button>
				</Show>
				<Show when={status().sessionId}>
					<span class="ml-auto text-xs text-muted-foreground">
						Session: {status().sessionId?.slice(0, 8)}...
					</span>
				</Show>
			</div>

			<div
				ref={scrollRef}
				onScroll={handleScroll}
				class="flex-1 overflow-y-auto rounded-md border border-input bg-background p-3 font-mono text-sm"
			>
				<Show when={loading()}>
					<div class="flex items-center justify-center py-8">
						<div class="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
					</div>
				</Show>
				<Show when={!loading()}>
					<Show when={rendered().length === 0}>
						<div class="flex items-center justify-center py-8 text-muted-foreground">
							No session history. Click Run to start.
						</div>
					</Show>
					<For each={rendered()}>
						{(item) => (
							<div class="mb-2">
								{item.kind === "text" && (
									<div class="whitespace-pre-wrap">{item.content}</div>
								)}
								{item.kind === "tool_group" && (
									<div class="text-muted-foreground italic">{item.content}</div>
								)}
								{item.kind === "user" && (
									<div class="rounded bg-primary/10 px-2 py-1 text-primary">{item.content}</div>
								)}
								{item.kind === "user_queued" && (
									<div class="rounded bg-muted px-2 py-1 text-muted-foreground">[queued] {item.content}</div>
								)}
								{item.kind === "error" && (
									<div class="text-destructive">{item.content}</div>
								)}
								{item.kind === "clear" && (
									<div class="my-2 flex items-center gap-2 text-muted-foreground">
										<div class="flex-1 border-t border-border" />
										<span class="text-xs">{item.content}</span>
										<div class="flex-1 border-t border-border" />
									</div>
								)}
								{item.kind === "exit" && (
									<div class="text-muted-foreground italic">{item.content}</div>
								)}
								{item.kind === "raw" && (
									<div class="whitespace-pre-wrap text-muted-foreground">{item.content}</div>
								)}
							</div>
						)}
					</For>
				</Show>
			</div>

			<div class="mt-2 flex gap-2">
				<input
					type="text"
					value={inputText()}
					onInput={(e) => setInputText(e.currentTarget.value)}
					onKeyDown={handleKeyDown}
					disabled={status().running}
					placeholder={status().running ? "Running..." : "Type a message..."}
					class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
				/>
				<button
					onClick={handleSend}
					disabled={!inputText().trim() || status().running}
					class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					Send
				</button>
			</div>

			<Show when={confirmingKill()}>
				<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
					<div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
						<h2 class="mb-4 text-lg font-semibold">Kill Process</h2>
						<p class="mb-4 text-sm text-muted-foreground">
							Stop the running Claude Code process? You can resume it later.
						</p>
						<div class="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirmingKill(false)}
								class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleStop}
								class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
							>
								Kill
							</button>
						</div>
					</div>
				</div>
			</Show>

			<Show when={confirmingReset()}>
				<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
					<div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
						<h2 class="mb-4 text-lg font-semibold">New Session</h2>
						<p class="mb-4 text-sm text-muted-foreground">
							Erase all session history and start fresh? This cannot be undone.
						</p>
						<div class="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirmingReset(false)}
								class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleReset}
								class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
							>
								Erase
							</button>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
