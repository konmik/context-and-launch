import { eventHandler } from "vinxi/http";
import { heartbeatManager } from "./heartbeat.js";

export default eventHandler({
	handler: () => "ok",
	websocket: {
		open(peer) {
			heartbeatManager.addPeer();
			peer.send("connected");
		},
		message(peer, message) {
			if (message.text() === "ping") {
				peer.send("pong");
			}
		},
		close() {
			heartbeatManager.removePeer();
		},
	},
});
