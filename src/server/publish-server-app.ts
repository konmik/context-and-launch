import { appLog } from "../core/infra/app-logger.js";

interface LocalFetchInit {
	host: string;
	protocol: string;
	headers: Headers;
	method: string;
	redirect: RequestRedirect;
	body?: ArrayBuffer;
}

export interface ServerApp {
	localFetch: (path: string, init: LocalFetchInit) => Promise<Response>;
	appLog: (category: string, message: string) => void;
}

interface ServerAppGlobal { __aiStagesServerApp?: ServerApp }

interface NitroApp {
	localFetch: (path: string, init: LocalFetchInit) => Promise<Response>;
}

export default function publishServerApp(nitroApp: NitroApp): void {
	(globalThis as unknown as ServerAppGlobal).__aiStagesServerApp = {
		localFetch: (path, init) => nitroApp.localFetch(path, init),
		appLog,
	};
}
