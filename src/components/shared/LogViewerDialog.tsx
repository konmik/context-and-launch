import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import {
	FloatingPanelRoot, FloatingPanelHeader, FloatingPanelBody,
	FloatingPanelDragTrigger, FloatingPanelResizeTrigger,
	FloatingPanelTitle,
} from "~/components/ui/floating-panel";
import { getAppLogs, serverClearAppLogs } from "./log-api.js";

export default function LogViewerDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [logs, setLogs] = createSignal("");
	let preRef: HTMLPreElement | undefined;

	createEffect(() => {
		if (!props.open) return;
		let stopped = false;
		let firstLoad = true;
		const load = async () => {
			const wasNearBottom = preRef
				? preRef.scrollHeight - preRef.scrollTop - preRef.clientHeight < 40
				: true;
			const text = await getAppLogs();
			if (!stopped) {
				setLogs(text);
				if (firstLoad || wasNearBottom) {
					requestAnimationFrame(() => {
						if (preRef) preRef.scrollTop = preRef.scrollHeight;
					});
				}
				firstLoad = false;
			}
		};
		void load();
		const timer = setInterval(() => void load(), 10000);
		onCleanup(() => { stopped = true; clearInterval(timer); });
	});

	return (
		<FloatingPanelRoot
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={{ width: 640, height: 480 }}
			minSize={{ width: 320, height: 200 }}
			persistRect
		>
			<FloatingPanelHeader>
				<FloatingPanelDragTrigger class="flex items-center justify-between">
					<FloatingPanelTitle class="text-lg font-semibold">Application Logs</FloatingPanelTitle>
					<div class="flex items-center gap-1">
						<button
							type="button"
							data-no-drag
							aria-label="Clear logs"
							onClick={async () => {
								await serverClearAppLogs();
								setLogs("");
							}}
							class="btn-icon"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg" width="16" height="16"
								viewBox="0 0 24 24" fill="none" stroke="currentColor"
								stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
							>
								<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
							</svg>
						</button>
						<button
							type="button"
							data-no-drag
							aria-label="Close"
							onClick={() => props.onOpenChange(false)}
							class="btn-icon"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg" width="16" height="16"
								viewBox="0 0 24 24" fill="none" stroke="currentColor"
								stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
							>
								<path d="M18 6 6 18"/><path d="m6 6 12 12"/>
							</svg>
						</button>
					</div>
				</FloatingPanelDragTrigger>
			</FloatingPanelHeader>

			<FloatingPanelBody>
				<Show when={logs()} fallback={<p class="text-sm text-muted-foreground">No logs yet.</p>}>
					<pre
						ref={preRef}
						class={
							"flex-1 overflow-auto rounded-md border border-border"
							+ " bg-background p-3 text-xs font-mono whitespace-pre leading-relaxed"
						}
					>{logs()}</pre>
				</Show>
			</FloatingPanelBody>

			<FloatingPanelResizeTrigger axis="s" />
			<FloatingPanelResizeTrigger axis="w" />
			<FloatingPanelResizeTrigger axis="e" />
			<FloatingPanelResizeTrigger axis="n" />
			<FloatingPanelResizeTrigger axis="ne" />
			<FloatingPanelResizeTrigger axis="nw" />
			<FloatingPanelResizeTrigger axis="sw" />
			<FloatingPanelResizeTrigger axis="se">
				<svg
					xmlns="http://www.w3.org/2000/svg" width="12" height="12"
					viewBox="0 0 12 12"
				>
					<path
						d="M10 2v8H2" fill="none" stroke="currentColor"
						stroke-width="1.5" stroke-linecap="round"
					/>
				</svg>
			</FloatingPanelResizeTrigger>
		</FloatingPanelRoot>
	);
}
