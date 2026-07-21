import { createSignal, createMemo, createEffect, on } from "solid-js";
import { interpolatePrompt } from "~/core/launcher/prompt-interpolation.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

export interface PromptPreviewDeps {
	selectedTemplate: () => string;
	checkedSkills: () => Set<string>;
	orderedSkills: () => { name: string; text: string }[];
	config: () => MergedLauncherConfig | null;
	/** Omitted for a project-level launch: ticket placeholders are then unavailable. */
	ticket?: () => TicketInfo;
	resetKey: () => string;
	projectPath: () => string;
	worktreeDir: () => string;
	projectSlug: string;
	launchDir: () => string;
}

export function createPromptPreviewController(deps: PromptPreviewDeps) {
	const [editMode, setEditModeRaw] = createSignal(false);
	const [editedPrompt, setEditedPrompt] = createSignal("");

	const generatedPrompt = createMemo(() => {
		const cfg = deps.config();
		if (!cfg) return "";
		const templateName = deps.selectedTemplate();
		const templateText = cfg.templates.find(t => t.name === templateName)?.text ?? "";
		const checked = deps.checkedSkills();
		const skillTexts = deps.orderedSkills()
			.filter(s => checked.has(s.name))
			.map(s => s.text);
		const variables: Record<string, string> = {
			projectPath: deps.projectPath(),
			projectSlug: deps.projectSlug,
			skills: skillTexts.join('\n'),
			launchDir: deps.launchDir(),
		};
		const t = deps.ticket?.();
		if (t) {
			const ticketDir = deps.worktreeDir().replace(/[\\/]$/, '') + "/" + t.folderName;
			variables.ticketDir = ticketDir;
			variables.ticketSlug = t.folderName;
			variables.ticketTitle = t.title;
			variables.ticketNumber = t.number;
			variables.ticketStatus = t.status;
		}
		return interpolatePrompt(templateText, variables);
	});

	const currentPrompt = createMemo(() =>
		editMode() ? editedPrompt() : generatedPrompt(),
	);

	function setEditMode(on: boolean) {
		if (on) {
			setEditedPrompt(generatedPrompt());
		}
		setEditModeRaw(on);
	}

	createEffect(on(
		() => deps.resetKey(),
		() => setEditModeRaw(false),
		{ defer: true },
	));

	return {
		editMode,
		setEditMode,
		editedPrompt,
		setEditedPrompt,
		currentPrompt,
	};
}

export type PromptPreviewController = ReturnType<typeof createPromptPreviewController>;
