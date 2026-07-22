import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Trash2, X } from "lucide-solid";
import {
	FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
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
		<FloatingWindow
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={{ width: 640, height: 480 }}
			minSize={{ width: 320, height: 200 }}
			persistRect
		>
			<FloatingWindowHeader
				title={<FloatingPanelTitle>Application Logs</FloatingPanelTitle>}
				actions={<>
					<button
						type="button"
						aria-label="Clear logs"
						onClick={async () => {
							await serverClearAppLogs();
							setLogs("");
						}}
						class="btn-icon"
					>
						<Trash2 size={16} />
					</button>
					<button
						type="button"
						aria-label="Close"
						onClick={() => props.onOpenChange(false)}
						class="btn-icon"
					>
						<X size={16} />
					</button>
				</>}
			/>

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
		</FloatingWindow>
	);
}
