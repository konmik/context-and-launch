import { createSignal, createEffect, Show } from "solid-js";
import { Trash2 } from "~/components/ui/icons.js";
import { X } from "~/components/ui/icons.js";
import {
	FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
	FloatingPanelTitle,
} from "~/components/ui/floating-panel";
import { getAppLogs, serverClearAppLogs } from "./log-api.js";
import LogTextView from "./LogTextView.js";

export default function LogViewerDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [logText, setLogText] = createSignal<string>();
	let loadVersion = 0;

	createEffect(() => props.open, (open) => {
		if (!open) return;
		setLogText(undefined);
		let stopped = false;
		const load = async () => {
			const version = ++loadVersion;
			const text = await getAppLogs();
			if (stopped || version !== loadVersion) return;
			setLogText(text);
		};
		void load();
		const timer = setInterval(() => void load(), 10000);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	});

	return (
		<FloatingWindow
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={{ width: 960, height: 720 }}
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
							loadVersion += 1;
							await serverClearAppLogs();
							setLogText("");
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
				<div class="flex min-h-0 flex-1 p-4">
					<Show
						when={logText()}
						fallback={logText() === undefined
							? (
								<p
									data-testid="log-viewer-loading"
									class="text-sm text-muted-foreground"
								>
									Loading...
								</p>
							)
							: <p class="text-sm text-muted-foreground">No logs yet.</p>}
					>
						{(text) => <LogTextView text={text()} />}
					</Show>
				</div>
			</FloatingPanelBody>
		</FloatingWindow>
	);
}
