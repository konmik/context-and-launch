import { Show, type JSX } from "solid-js";
import { DialogRoot, DialogTitle, DialogCloseTrigger } from "../ui/dialog";
import { modEnterHint } from "~/lib/use-mod-enter-submit";
import { slugifyColumnName } from "~/lib/slugify.js";

export type ItemType = "template" | "skill" | "profile" | "shortcut";
export type Scope = "app" | "project";

export interface ItemFormState {
	mode: "add" | "edit";
	itemType: ItemType;
	scope: Scope;
	name: string;
	text: string;
	oldName?: string;
}

export interface ColumnFormState {
	mode: "add" | "edit";
	name: string;
	description: string;
	oldName?: string;
}

export interface RenameFormState {
	oldName: string;
	newName: string;
	scope: "all" | "current" | "none";
}

export interface DeleteTarget {
	type: "board" | "column";
	id: string;
	name: string;
}

function DialogHeader(props: { title: string }) {
	return (
		<div class="flex items-center justify-between border-b border-border px-6 py-4">
			<DialogTitle class="mb-0">{props.title}</DialogTitle>
			<DialogCloseTrigger>
				<svg
			xmlns="http://www.w3.org/2000/svg" width="16" height="16"
			viewBox="0 0 24 24" fill="none" stroke="currentColor"
			stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
		>
			<path d="M18 6 6 18"/><path d="m6 6 12 12"/>
		</svg>
			</DialogCloseTrigger>
		</div>
	);
}

function ErrorBanner(props: { message: string }) {
	return (
		<Show when={props.message}>
			<div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{props.message}
			</div>
		</Show>
	);
}

function DialogFooter(props: { children: JSX.Element }) {
	return <div class="flex justify-end gap-2 border-t border-border px-6 py-3">{props.children}</div>;
}

const itemTypeLabel: Record<ItemType, string> = {
	template: "Prompt", skill: "Skill", profile: "Launch", shortcut: "Shortcut",
};

export function ItemFormDialog(props: {
	form: ItemFormState | null;
	setForm: (form: ItemFormState | null) => void;
	onSubmit: () => void;
}) {
	return (
		<DialogRoot open={!!props.form} onOpenChange={() => props.setForm(null)} class="max-w-lg p-0">
			<Show when={props.form}>
				{(f) => (<>
					<DialogHeader title={`${f().mode === "add" ? "Add" : "Edit"} ${itemTypeLabel[f().itemType]}`} />
					<div class="space-y-3 px-6 py-4">
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Name</label>
							<input
								type="text"
								value={f().name}
								onInput={(e) => props.setForm({
									...f(), name: e.currentTarget.value,
								})}
								class="input input-sm"
								placeholder={
									f().itemType === "profile" ? "Launch name"
									: f().itemType === "skill" ? "Skill name"
									: f().itemType === "shortcut" ? "Shortcut name"
									: "Prompt name"
								}
							/>
						</div>
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">
								{f().itemType === "shortcut" || f().itemType === "profile"
									? "Command" : "Prompt"}
							</label>
							<textarea
								value={f().text}
								onInput={(e) => props.setForm({
									...f(), text: e.currentTarget.value,
								})}
								class="input min-h-[120px]"
								style={{ height: "auto" }}
								placeholder={
									f().itemType === "profile"
										? "e.g. powershell -File run-agent.ps1"
									: f().itemType === "shortcut"
										? "e.g. code {{projectPath}}"
									: "Prompt text with {{placeholders}}"
								}
							/>
							<p class="mt-1 text-xs text-muted-foreground">
								{f().itemType === "profile"
									? "{{initialPrompt}} {{windowTitle}} {{appConfigDir}}"
								: f().itemType === "shortcut"
									? [
										"{{ticketDir}} {{ticketSlug}}",
										"{{ticketTitle}} {{ticketNumber}}",
										"{{ticketStatus}} {{projectPath}}",
										"{{projectSlug}} {{launchDir}}",
									].join(" ")
								: [
										"{{ticketDir}} {{ticketSlug}}",
										"{{ticketTitle}} {{ticketNumber}}",
										"{{ticketStatus}} {{projectPath}}",
										"{{projectSlug}}",
									].join(" ")}
							</p>
						</div>
						<Show when={f().mode === "add"}>
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">Scope</label>
								<div class="flex gap-4">
									<label class="flex items-center gap-1.5 text-sm">
										<input
											type="radio" name="scope"
											checked={f().scope === "app"}
											onChange={() => props.setForm({
												...f(), scope: "app",
											})}
										/> User
									</label>
									<label class="flex items-center gap-1.5 text-sm">
										<input
											type="radio" name="scope"
											checked={f().scope === "project"}
											onChange={() => props.setForm({
												...f(), scope: "project",
											})}
										/> Project
									</label>
								</div>
							</div>
						</Show>
					</div>
					<DialogFooter>
						<button onClick={() => props.setForm(null)} class="btn-secondary">Cancel</button>
						<button
							onClick={props.onSubmit}
							disabled={!f().name.trim()}
							title={modEnterHint()}
							class="btn-primary"
						>{f().mode === "add" ? "Add" : "Save"}</button>
					</DialogFooter>
				</>)}
			</Show>
		</DialogRoot>
	);
}

export function ColumnFormDialog(props: {
	columnForm: ColumnFormState | null;
	setColumnForm: (form: ColumnFormState | null) => void;
	renameActive: boolean;
	columnError: string;
	validation: string;
	onSubmit: () => void;
}) {
	return (
		<DialogRoot
			open={!!props.columnForm && !props.renameActive}
			onOpenChange={() => props.setColumnForm(null)}
			class="max-w-lg p-0"
		>
			<Show when={props.columnForm}>
				{(cf) => (<>
					<DialogHeader title={cf().mode === "add" ? "Add Column" : "Edit Column"} />
					<div class="space-y-3 px-6 py-4">
						<ErrorBanner message={props.columnError} />
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Name</label>
							<input
								type="text"
								value={cf().name}
								onInput={(e) => props.setColumnForm({ ...cf(), name: e.currentTarget.value })}
								class="input input-sm"
								data-testid="column-name-input"
								placeholder="e.g. In Progress"
							/>
							<Show when={cf().name.trim()}>
								<p class="mt-1 text-xs text-muted-foreground" data-testid="column-slug-preview">
									Column slug: {slugifyColumnName(cf().name)}
								</p>
							</Show>
							<Show when={props.validation}>
								<p
									class="mt-1 text-xs text-destructive"
									data-testid="column-name-error"
								>{props.validation}</p>
							</Show>
						</div>
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Description (optional)</label>
							<textarea
								value={cf().description}
								onInput={(e) => props.setColumnForm({ ...cf(), description: e.currentTarget.value })}
								class="input min-h-[60px]"
								style={{ height: "auto" }}
								data-testid="column-desc-input"
								placeholder="Brief description of this column"
							/>
						</div>
					</div>
					<DialogFooter>
						<button onClick={() => props.setColumnForm(null)} class="btn-secondary">Cancel</button>
						<button
							onClick={props.onSubmit}
							disabled={!cf().name.trim() || !!props.validation}
							title={modEnterHint()}
							class="btn-primary"
							data-testid="column-form-submit"
						>{cf().mode === "add" ? "Add" : "Save"}</button>
					</DialogFooter>
				</>)}
			</Show>
		</DialogRoot>
	);
}

export function RenameColumnDialog(props: {
	renameForm: RenameFormState | null;
	setRenameForm: (form: RenameFormState | null) => void;
	columnError: string;
	onRename: () => void;
}) {
	return (
		<DialogRoot open={!!props.renameForm} onOpenChange={() => props.setRenameForm(null)} class="max-w-lg p-0">
			<Show when={props.renameForm}>
				{(rf) => (<>
					<DialogHeader title="Rename Column" />
					<div class="space-y-3 px-6 py-4">
						<ErrorBanner message={props.columnError} />
						<p class="text-sm">
							Renaming "{rf().oldName}" to "{slugifyColumnName(rf().newName)}".
						</p>
						<p class="text-sm text-muted-foreground">
							Update ticket statuses and column defaults?
						</p>
						<div class="space-y-2">
							<label class="flex items-center gap-2 text-sm">
								<input
								type="radio" name="rename-scope"
								checked={rf().scope === "all"}
								onChange={() => props.setRenameForm({
									...rf(), scope: "all",
								})}
								data-testid="rename-scope-all"
							/>
								All projects using this board
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input
								type="radio" name="rename-scope"
								checked={rf().scope === "current"}
								onChange={() => props.setRenameForm({
									...rf(), scope: "current",
								})}
								data-testid="rename-scope-current"
							/>
								Current project only
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input
								type="radio" name="rename-scope"
								checked={rf().scope === "none"}
								onChange={() => props.setRenameForm({
									...rf(), scope: "none",
								})}
								data-testid="rename-scope-none"
							/>
								None (rename column only)
							</label>
						</div>
					</div>
					<DialogFooter>
						<button onClick={() => props.setRenameForm(null)} class="btn-secondary">Cancel</button>
						<button onClick={props.onRename} title={modEnterHint()} class="btn-primary">Rename</button>
					</DialogFooter>
				</>)}
			</Show>
		</DialogRoot>
	);
}

export function BoardFormDialog(props: {
	boardForm: { name: string } | null;
	setBoardForm: (form: { name: string } | null) => void;
	columnError: string;
	onCreate: () => void;
}) {
	return (
		<DialogRoot open={!!props.boardForm} onOpenChange={() => props.setBoardForm(null)} class="max-w-sm p-0">
			<Show when={props.boardForm}>
				{(bf) => (<>
					<DialogHeader title="Add Board" />
					<div class="space-y-3 px-6 py-4">
						<ErrorBanner message={props.columnError} />
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Board name</label>
							<input
								type="text"
								value={bf().name}
								onInput={(e) => props.setBoardForm({ name: e.currentTarget.value })}
								class="input input-sm"
								data-testid="board-name-input"
								placeholder="e.g. Development"
							/>
						</div>
					</div>
					<DialogFooter>
						<button onClick={() => props.setBoardForm(null)} class="btn-secondary">Cancel</button>
						<button
							onClick={props.onCreate}
							disabled={!bf().name.trim()}
							title={modEnterHint()}
							class="btn-primary"
							data-testid="board-form-submit"
						>Add</button>
					</DialogFooter>
				</>)}
			</Show>
		</DialogRoot>
	);
}

export function DeleteConfirmDialog(props: {
	deleteConfirm: DeleteTarget | null;
	setDeleteConfirm: (target: DeleteTarget | null) => void;
	onDeleteBoard: () => void;
	onDeleteColumn: () => void;
}) {
	return (
		<DialogRoot open={!!props.deleteConfirm} onOpenChange={() => props.setDeleteConfirm(null)} class="max-w-sm p-0">
			<Show when={props.deleteConfirm}>
				{(dc) => (<>
					<DialogHeader title={`Delete ${dc().type === "board" ? "Board" : "Column"}`} />
					<div class="px-6 py-4">
						<p class="text-sm" data-testid="delete-confirm-message">
							{dc().type === "board"
								? `Delete board "${dc().name}"? This cannot be undone.`
								: `Delete column "${dc().name}"? Tickets with this status `
									+ "will appear in the undefined column."}
						</p>
					</div>
					<DialogFooter>
						<button onClick={() => props.setDeleteConfirm(null)} class="btn-secondary">Cancel</button>
						<button
							onClick={dc().type === "board" ? props.onDeleteBoard : props.onDeleteColumn}
							class="btn-primary bg-destructive text-destructive-foreground hover:bg-destructive/90"
							data-testid="delete-confirm-btn"
						>Delete</button>
					</DialogFooter>
				</>)}
			</Show>
		</DialogRoot>
	);
}

export function ProjectBoardConfirmDialog(props: {
	projectBoardConfirm: { id: string; name: string } | null;
	setProjectBoardConfirm: (target: { id: string; name: string } | null) => void;
	onConfirm: () => void;
}) {
	return (
		<DialogRoot
			open={!!props.projectBoardConfirm}
			onOpenChange={() => props.setProjectBoardConfirm(null)}
			class="max-w-sm p-0"
		>
			<Show when={props.projectBoardConfirm}>
				{(pbc) => (<>
					<DialogHeader title="Set Project Board" />
					<div class="px-6 py-4">
						<p class="text-sm" data-testid="set-project-board-message">
							Set "{pbc().name}" as the board for this project? Tickets whose
							status is not a column in this board will appear in the undefined
							column and must be updated manually.
						</p>
					</div>
					<DialogFooter>
						<button
							onClick={() => props.setProjectBoardConfirm(null)}
							class="btn-secondary"
							data-testid="set-project-board-cancel-btn"
						>Cancel</button>
						<button
							onClick={props.onConfirm}
							class="btn-primary"
							data-testid="set-project-board-confirm-btn"
						>Set board</button>
					</DialogFooter>
				</>)}
			</Show>
		</DialogRoot>
	);
}
