import { createSignal } from "solid-js";
import type { TicketInfo } from "~/types.js";

interface AiConsoleTabProps {
	slug: string;
	ticket: TicketInfo;
}

export default function AiConsoleTab(props: AiConsoleTabProps) {
	const [launching, setLaunching] = createSignal(false);

	async function handleRun() {
		setLaunching(true);
		try {
			await fetch(
				`/api/projects/${props.slug}/board/tickets/${props.ticket.folderName}/ai/run`,
				{ method: "POST" }
			);
		} catch {
			// swallow -- terminal may or may not open
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
		</div>
	);
}
