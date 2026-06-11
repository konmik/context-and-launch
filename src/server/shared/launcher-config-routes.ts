import type { APIEvent } from "@solidjs/start/server";
import * as v from "valibot";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";
import { parseBody } from "~/server/shared/route-helpers.js";
import type { LauncherConfigManager } from "~/server/launcher/launcher-config.js";

export const ItemAddBody = v.object({
	name: v.string(),
	text: v.optional(v.string()),
	command: v.optional(v.string()),
});
export type ItemAddBody = v.InferOutput<typeof ItemAddBody>;

export const ItemUpdateBody = v.object({
	oldName: v.string(),
	name: v.string(),
	text: v.optional(v.string()),
	command: v.optional(v.string()),
});
export type ItemUpdateBody = v.InferOutput<typeof ItemUpdateBody>;

export const ItemDeleteBody = v.object({
	name: v.string(),
});
export type ItemDeleteBody = v.InferOutput<typeof ItemDeleteBody>;

export const SkillReorderBody = v.object({
	name: v.string(),
	order: v.number(),
});
export type SkillReorderBody = v.InferOutput<typeof SkillReorderBody>;

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
			const body = await parseBody(request, ItemAddBody);
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				(launcherConfigManager[k.add] as Function)
					.call(launcherConfigManager, scope, projectSlug, pick(body, k.fields));
			}, 201);
		},
		async PUT({ params, request }: APIEvent) {
			const body = await parseBody(request, ItemUpdateBody);
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				(launcherConfigManager[k.update] as Function)
					.call(launcherConfigManager, scope, projectSlug, body.oldName, pick(body, k.fields));
			}, 204);
		},
		async DELETE({ params, request }: APIEvent) {
			const body = await parseBody(request, ItemDeleteBody);
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				(launcherConfigManager[k.remove] as Function)
					.call(launcherConfigManager, scope, projectSlug, body.name);
			}, 204);
		},
	};
}

export function skillReorderRoute() {
	return {
		async PUT({ params, request }: APIEvent) {
			const body = await parseBody(request, SkillReorderBody);
			const [scope, projectSlug] = scopeOf(params);
			return handleRoute(() => {
				launcherConfigManager.setSkillOrder(scope, projectSlug, body.name, body.order);
			}, 204);
		},
	};
}
