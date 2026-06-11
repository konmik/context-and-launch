import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";

const POLL_INTERVAL_MS = 2000;

export function createSyncPendingPoller(projectSlug: Accessor<string>): {
	hasPendingChanges: Accessor<boolean>;
} {
	if (typeof window === "undefined") {
		return { hasPendingChanges: () => false };
	}

	const [hasPendingChanges, setHasPendingChanges] = createSignal(false);

	createEffect(() => {
		const currentProjectSlug = projectSlug();
		setHasPendingChanges(false);
		if (!currentProjectSlug) return;

		let stopped = false;
		let inFlight = false;

		const poll = async () => {
			if (inFlight) return;
			inFlight = true;
			try {
				const res = await fetch(`/api/projects/${currentProjectSlug}/board/pending`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = await res.json();
				if (!stopped) setHasPendingChanges(data.hasPendingChanges === true);
			} catch (err) {
				console.warn("sync-pending poll failed:", err);
			} finally {
				inFlight = false;
			}
		};

		void poll();
		const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
		onCleanup(() => {
			stopped = true;
			clearInterval(timer);
		});
	});

	return { hasPendingChanges };
}
