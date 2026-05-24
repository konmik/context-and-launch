const PING_INTERVAL_MS = 10_000;
const INITIAL_RECONNECT_MS = 2_000;
const MAX_RECONNECT_MS = 10_000;

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectDelay = INITIAL_RECONNECT_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
	const proto = location.protocol === "https:" ? "wss:" : "ws:";
	return `${proto}//${location.host}/api/heartbeat`;
}

function clearTimers(): void {
	if (pingTimer !== null) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
	if (reconnectTimer !== null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function connect(): void {
	clearTimers();
	if (ws !== null) {
		ws.onopen = null;
		ws.onclose = null;
		ws.onerror = null;
		ws.onmessage = null;
		if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
			ws.close();
		}
		ws = null;
	}

	ws = new WebSocket(getWsUrl());

	ws.onopen = () => {
		reconnectDelay = INITIAL_RECONNECT_MS;
		pingTimer = setInterval(() => {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send("ping");
			}
		}, PING_INTERVAL_MS);
	};

	ws.onclose = () => {
		clearTimers();
		scheduleReconnect();
	};

	ws.onerror = () => {
		// The close event will fire after error, which triggers reconnect
	};
}

function scheduleReconnect(): void {
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect();
		reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
	}, reconnectDelay);
}

function handleVisibilityChange(): void {
	if (document.visibilityState === "visible") {
		if (ws === null || ws.readyState !== WebSocket.OPEN) {
			reconnectDelay = INITIAL_RECONNECT_MS;
			connect();
		}
	}
}

// Start heartbeat
connect();
document.addEventListener("visibilitychange", handleVisibilityChange);
