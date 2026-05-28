const SHUTDOWN_DELAY_MS = 30_000;

export class HeartbeatManager {
	private peerCount = 0;
	private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
	private exitFn: () => void;

	constructor(exitFn?: () => void) {
		this.exitFn = exitFn ?? (() => process.exit(0));
	}

	addPeer(): void {
		this.peerCount++;
		if (this.shutdownTimer !== null) {
			clearTimeout(this.shutdownTimer);
			this.shutdownTimer = null;
		}
	}

	removePeer(): void {
		this.peerCount = Math.max(0, this.peerCount - 1);
		if (this.peerCount === 0 && this.shutdownTimer === null) {
			this.shutdownTimer = setTimeout(() => {
				this.shutdownTimer = null;
				this.exitFn();
			}, SHUTDOWN_DELAY_MS);
		}
	}

	getPeerCount(): number {
		return this.peerCount;
	}

	isShutdownScheduled(): boolean {
		return this.shutdownTimer !== null;
	}
}

export const heartbeatManager = new HeartbeatManager();
