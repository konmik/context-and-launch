import type { APIEvent } from "@solidjs/start/server";
import { sessionManager } from "~/server/instances.js";

export async function GET({ params, request }: APIEvent) {
	const { slug, folderName } = params;
	const url = new URL(request.url);
	const since = Number(url.searchParams.get("since") ?? "0");

	console.log(`[SSE stream] opened for ${slug}/${folderName} since=${since}`);

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let enqueued = 0;

			function send(event: { type: string; data: unknown; timestamp: number }) {
				const line = `data: ${JSON.stringify(event)}\n\n`;
				try {
					controller.enqueue(encoder.encode(line));
					enqueued++;
					console.log(`[SSE stream] enqueued #${enqueued} type=${event.type} seq=${'seq' in event ? (event as Record<string, unknown>).seq : '?'}`);
				} catch (e) {
					console.log(`[SSE stream] enqueue failed:`, e);
				}
			}

			const buffer = sessionManager.getEventBuffer(slug, folderName);
			console.log(`[SSE stream] replaying ${buffer.length} buffered events (filtering since=${since})`);
			for (const event of buffer) {
				if ((event.seq ?? 0) > since) {
					send(event);
				}
			}

			const unsubscribe = sessionManager.subscribe(slug, folderName, (event) => {
				console.log(`[SSE stream] live event type=${event.type} seq=${event.seq}`);
				send(event);
			});

			request.signal.addEventListener("abort", () => {
				console.log(`[SSE stream] client disconnected ${slug}/${folderName}`);
				unsubscribe();
				try { controller.close(); } catch { /* already closed */ }
			});
		}
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive"
		}
	});
}
