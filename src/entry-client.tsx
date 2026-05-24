import { mount, StartClient } from "@solidjs/start/client";
import "./lib/heartbeat-client.js";

mount(() => <StartClient />, document.getElementById("app")!);
