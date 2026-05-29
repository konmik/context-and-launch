import type { ColumnDefinition } from "~/server/project/board-config.js";
import type { ItemType, Scope, ItemFormState } from "./launcher-settings-dialogs.js";
import { slugifyColumnName } from "~/lib/slugify.js";

const API_PATH_SEGMENTS: Record<ItemType, string> = {
	template: "templates",
	skill: "skills",
	profile: "profiles",
	shortcut: "shortcuts",
};

export function itemEndpoint(projectSlug: string, itemType: ItemType, scope: Scope): string {
	const base = scope === "app"
		? "/api/launcher-config"
		: `/api/projects/${projectSlug}/launcher-config`;
	return `${base}/${API_PATH_SEGMENTS[itemType]}`;
}

export function validateColumnName(
	name: string,
	mode: "add" | "edit",
	oldName: string | undefined,
	columns: ColumnDefinition[],
): string {
	const slugified = slugifyColumnName(name);
	if (!slugified) return name.trim() ? "Name resolves to empty after slugification" : "";
	if (slugified === "undefined") return 'Name "undefined" is reserved';
	const others = mode === "edit" && oldName
		? columns.filter(c => c.name !== oldName)
		: columns;
	if (others.some(c => c.name === slugified)) return `Name "${slugified}" already exists`;
	return "";
}

export function buildFormPayload(form: ItemFormState): Record<string, string | undefined> {
	const usesCommand = form.itemType === "profile" || form.itemType === "shortcut";
	const textField = usesCommand ? "command" : "text";
	return form.mode === "add"
		? { name: form.name, [textField]: form.text }
		: { oldName: form.oldName, name: form.name, [textField]: form.text };
}
