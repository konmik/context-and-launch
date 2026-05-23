import { createSignal, Show } from "solid-js";
import type { TicketInfo } from "~/types.js";

interface AiConsoleTabProps {
	slug: string;
	ticket: TicketInfo;
}

export default function AiConsoleTab(props: AiConsoleTabProps) {
	const [launching, setLaunching] = createSignal(false);
	const [errorMsg, setErrorMsg] = createSignal("");

	async function handleRun() {
		setLaunching(true);
		setErrorMsg("");
		try {
			const res = await fetch(
				`/api/projects/${props.slug}/board/tickets/${props.ticket.folderName}/ai/run`,
				{ method: "POST" }
			);
			if (!res.ok) {
				setErrorMsg(await res.text() || `Error ${res.status}`);
			}
		} catch (e: any) {
			setErrorMsg(e?.message ?? "Network error");
		} finally {
			setLaunching(false);
		}
	}

	return (
		<div class="flex h-full items-center justify-center">
			<button
				onClick={handleRun}
				disabled={launching()}
				class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{launching() ? "Launching..." : "Run"}
			</button>

			<Show when={errorMsg()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div class="fixed inset-0" onClick={() => setErrorMsg("")} />
					<div class="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
						<p class="mb-4 text-sm text-destructive">{errorMsg()}</p>
						<div class="flex justify-end">
							<button
								onClick={() => setErrorMsg("")}
								class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
							>
								OK
							</button>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
