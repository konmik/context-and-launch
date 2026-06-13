import { createSignal, createMemo, createEffect, on } from "solid-js";
import { interpolatePrompt } from "~/core/launcher/prompt-interpolation.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

export interface PromptPreviewDeps {
	selectedTemplate: () => string;
	checkedSkills: () => Set<string>;
	orderedSkills: () => { name: string; text: string }[];
	config: () => MergedLauncherConfig | null;
	ticket: () => TicketInfo;
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
		const wd = deps.worktreeDir();
		const t = deps.ticket();
		const ticketDir = wd.replace(/[\\/]$/, '') + "/" + t.folderName;
		const variables: Record<string, string> = {
			ticketDir,
			ticketSlug: t.folderName,
			ticketTitle: t.title,
			ticketNumber: t.number,
			ticketStatus: t.status,
			projectPath: deps.projectPath(),
			projectSlug: deps.projectSlug,
			skills: skillTexts.join('\n'),
			launchDir: deps.launchDir(),
		};
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
		() => deps.ticket().folderName,
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
