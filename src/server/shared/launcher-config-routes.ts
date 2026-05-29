import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";
import type { LauncherConfigManager } from "~/server/launcher/launcher-config.js";

type Scope = "app" | "project";

interface ItemKind {
	add: keyof LauncherConfigManager;
	update: keyof LauncherConfigManager;
	remove: keyof LauncherConfigManager;
	fields: readonly string[];
}

const KINDS = {
	template: { add: "addTemplate", update: "updateTemplate", remove: "removeTemplate", fields: ["name", "text"] },
	skill: { add: "addSkill", update: "updateSkill", remove: "removeSkill", fields: ["name", "text"] },
	profile: { add: "addProfile", update: "updateProfile", remove: "removeProfile", fields: ["name", "command"] },
	shortcut: { add: "addShortcut", update: "updateShortcut", remove: "removeShortcut", fields: ["name", "command"] },
} as const satisfies Record<string, ItemKind>;

function scopeOf(params: Record<string, string>): [Scope, string] {
	return params.projectSlug ? ["project", params.projectSlug] : ["app", ""];
}

function pick(body: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const f of fields) result[f] = body[f];
	return result;
}

function handleRoute(fn: () => void, status: number) {
	try {
		fn();
		return new Response(null, { status });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}

export function itemRoutes(kind: keyof typeof KINDS) {
	const k = KINDS[kind];
	return {
		async POST({ params, request }: APIEvent) {
			const body = await request.json();
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				(launcherConfigManager[k.add] as Function).call(launcherConfigManager, scope, projectSlug, pick(body, k.fields));
			}, 201);
		},
		async PUT({ params, request }: APIEvent) {
			const body = await request.json();
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				(launcherConfigManager[k.update] as Function).call(launcherConfigManager, scope, projectSlug, body.oldName, pick(body, k.fields));
			}, 204);
		},
		async DELETE({ params, request }: APIEvent) {
			const body = await request.json();
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				(launcherConfigManager[k.remove] as Function).call(launcherConfigManager, scope, projectSlug, body.name);
			}, 204);
		},
	};
}

export function skillReorderRoute() {
	return {
		async PUT({ params, request }: APIEvent) {
			const body = await request.json();
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				launcherConfigManager.setSkillOrder(scope, projectSlug, body.name, body.order);
			}, 204);
		},
	};
}
