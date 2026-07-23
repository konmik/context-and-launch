import { Show, For } from "solid-js";
import { Portal } from "solid-js/web";
import ChevronDown from "lucide-solid/icons/chevron-down";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import Trash2 from "lucide-solid/icons/trash-2";
import Plus from "lucide-solid/icons/plus";
import Upload from "lucide-solid/icons/upload";
import Folder from "lucide-solid/icons/folder";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
import MarkdownEditor from "../shared/MarkdownEditor";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import { type ActiveFile, type FileView, activeFileLabel, isActiveFileMatch } from "./ticket-detail-pure.js";
import type { ShortcutConfirmation } from "./ticket-detail-shortcuts.js";

export type { ActiveFile } from "./ticket-detail-pure.js";
export { activeFileLabel, isActiveFileMatch } from "./ticket-detail-pure.js";

export function DiscardConfirmation(props: {
  open: boolean;
  message: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  useModEnterSubmit({
    onSubmit: () => props.onDiscard(),
    disabled: () => false,
    active: () => props.open,
  });

  return (
    <DialogRoot
      open={props.open}
      onOpenChange={props.onCancel}
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
    >
      <DialogTitle>Unsaved Changes</DialogTitle>
      <DialogDescription>{props.message}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          class="btn-secondary"
          data-testid="ticket-detail-discard-cancel"
        >Cancel</button>
        <button
          type="button"
          onClick={props.onDiscard}
          title={modEnterHint()}
          class="btn-destructive"
          data-testid="ticket-detail-discard-discard"
        >Discard</button>
      </div>
    </DialogRoot>
  );
}

export const TAB_PANE_CLASS = "flex-1 overflow-hidden pb-4";
export const TAB_CONTENT_CLASS = `${TAB_PANE_CLASS} px-4`;

export function FileToolbar(props: {
  activeFile: ActiveFile;
  options: ActiveFile[];
  isStale: (path: string) => boolean;
  dropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  onSelect: (af: ActiveFile) => void;
  onTrash: () => void;
  onNewFile: () => void;
  onBrowse: () => void;
  browsing: boolean;
  uploading: boolean;
  dragging: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onFileInputChange: (e: Event) => void;
}) {
  let dropdownBtnRef: HTMLButtonElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  return (
    <>
      <div class="flex items-center gap-2 pt-4 pb-2">
        <div class="min-w-0 flex-1">
          <button
            ref={(el) => (dropdownBtnRef = el)}
            type="button"
            data-testid="ticket-detail-editor-file-dropdown-trigger"
            onClick={() => props.setDropdownOpen(!props.dropdownOpen)}
            class={
              "flex h-9 w-full items-center justify-between "
              + "rounded-md border border-input bg-background px-3 text-sm"
            }
          >
            <span class="truncate">
              {activeFileLabel(props.activeFile)}
              {props.activeFile.type === "reference" && (
                <span class="ml-1 text-xs text-muted-foreground">REFERENCE</span>
              )}
            </span>
            <ChevronDown size={16} class="ml-2 shrink-0" />
          </button>
          <Show when={props.dropdownOpen}>
            <Portal>
              <div class="fixed inset-0" onClick={() => props.setDropdownOpen(false)} />
              <div
                class="fixed max-h-60 overflow-auto rounded-md border border-border bg-popover py-1"
                style={{
                  top: `${(dropdownBtnRef?.getBoundingClientRect().bottom ?? 0) + 4}px`,
                  left: `${dropdownBtnRef?.getBoundingClientRect().left ?? 0}px`,
                  width: `${dropdownBtnRef?.getBoundingClientRect().width ?? 0}px`,
                }}
              >
                <For each={props.options}>
                  {(option) => (
                    <button
                      type="button"
                      data-testid="ticket-detail-editor-file-dropdown-option"
                      onClick={() => props.onSelect(option)}
                      class={
                        "flex w-full items-center gap-1 px-3 py-2 text-left "
                        + "text-sm hover:bg-accent hover:text-accent-foreground "
                        + (isActiveFileMatch(option, props.activeFile)
                          ? "font-semibold" : "")
                      }
                    >
                      <span class="truncate">{activeFileLabel(option)}</span>
                      {option.type === "reference" && (
                        <>
                          <span class="shrink-0 text-xs text-muted-foreground">
                        REFERENCE
                      </span>
                          {props.isStale(option.path) && (
                            <span class="shrink-0" title="File not found on disk">
                              <TriangleAlert size={14} class="text-warning" />
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  )}
                </For>
              </div>
            </Portal>
          </Show>
        </div>
        <button
          type="button"
          data-testid="ticket-detail-editor-trash-button"
          onClick={props.onTrash}
          class="btn-icon text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          title={
            props.activeFile.type === "reference"
              ? "Remove reference"
              : "Delete file"
          }
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 pb-2">
        <button
          type="button"
          data-testid="ticket-detail-editor-new-file-button"
          onClick={props.onNewFile}
          class="btn-secondary btn-sm gap-1.5"
        >
          <Plus size={14} />
          New markdown file
        </button>
        <button
          type="button"
          data-testid="ticket-detail-editor-copy-button"
          onClick={() => fileInputRef?.click()}
          onDragOver={props.onDragOver}
          onDragLeave={props.onDragLeave}
          onDrop={props.onDrop}
          disabled={props.uploading}
          class={`btn-secondary btn-sm gap-1.5 ${props.dragging ? "border-primary bg-primary/10 text-primary" : ""}`}
        >
          <Upload size={14} />
          Drop a file to copy
        </button>
        <input
          ref={(el) => (fileInputRef = el)}
          type="file"
          multiple
          class="hidden"
          onChange={props.onFileInputChange}
        />
        <button
          type="button"
          data-testid="ticket-detail-editor-add-reference-button"
          onClick={props.onBrowse}
          disabled={props.browsing}
          class="btn-secondary btn-sm gap-1.5"
        >
          <Folder size={14} />
          Add file reference
        </button>
      </div>
    </>
  );
}

export function EditorPane(props: {
  view: FileView;
  content: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  readOnly: boolean;
  label: string;
}) {
  return (
    <>
      <Show when={props.view.kind === "editor"}>
        <MarkdownEditor
          value={props.content}
          onChange={props.onChange}
          onSave={props.onSave}
          placeholder="Write markdown here..."
          readOnly={props.readOnly}
        />
      </Show>
      <Show when={props.view.kind === "image" ? props.view : undefined}>
        {(view) => (
          <div class={
            "flex h-full items-center justify-center overflow-auto "
            + "rounded-md border border-input bg-background p-4"
          }>
            <a href={view().url} target="_blank" rel="noopener noreferrer">
              <img src={view().url} alt={props.label} class="max-h-full max-w-full cursor-pointer object-contain" />
            </a>
          </div>
        )}
      </Show>
      <Show when={props.view.kind === "unsupported"}>
        <div class="flex h-full items-center justify-center rounded-md border border-input bg-background">
          <p class="text-sm text-muted-foreground">Unable to show this file type</p>
        </div>
      </Show>
    </>
  );
}

export function NewFileDialog(props: {
  open: boolean;
  name: string;
  setName: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <DialogRoot
      open={props.open}
      onOpenChange={props.onClose}
      onMouseDown={(e: MouseEvent) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      <DialogTitle>New Markdown File</DialogTitle>
      <label class="field-label">
        File name (without .md extension)
      </label>
      <input
        type="text"
        value={props.name}
        onInput={(e) => props.setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onSubmit();
          if (e.key === "Escape") props.onClose();
        }}
        autofocus
        class="input mb-4"
        placeholder="e.g. design-notes"
        data-testid="ticket-detail-new-file-name-input"
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          class="btn-secondary"
          data-testid="ticket-detail-new-file-cancel"
        >Cancel</button>
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={!props.name.trim()}
          title={modEnterHint()}
          class="btn-primary"
          data-testid="ticket-detail-new-file-create"
        >Create</button>
      </div>
    </DialogRoot>
  );
}

export function DeleteFileDialog(props: {
  open: boolean;
  label: string;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <DialogRoot
      open={props.open}
      onOpenChange={props.onClose}
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
    >
      <DialogTitle>Delete File</DialogTitle>
      <DialogDescription>
        Delete {props.label}? This cannot be undone.
      </DialogDescription>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          class="btn-secondary"
          data-testid="ticket-detail-delete-file-cancel"
        >Cancel</button>
        <button
          type="button"
          onClick={props.onDelete}
          title={modEnterHint()}
          class="btn-destructive"
          data-testid="ticket-detail-delete-file-confirm"
        >Delete</button>
      </div>
    </DialogRoot>
  );
}

export function ConfirmUploadDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogRoot
      open={props.open}
      onOpenChange={props.onCancel}
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
    >
      <DialogTitle>{props.title}</DialogTitle>
      <DialogDescription>{props.description}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          class="btn-secondary"
          data-testid="ticket-detail-confirm-upload-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onConfirm}
          class={props.confirmClass}
          data-testid="ticket-detail-confirm-upload-confirm"
        >{props.confirmLabel}</button>
      </div>
    </DialogRoot>
  );
}

export function ShortcutConfirmationDialog(props: {
  info: ShortcutConfirmation | undefined;
  running: boolean;
  onCancel: () => void;
  onProceed: (name: string) => void;
}) {
  return (
    <DialogRoot
      open={!!props.info}
      onOpenChange={props.onCancel}
      class="max-w-sm"
    >
      <DialogTitle class="sr-only">
        {props.info?.type === "behindRemote" ? "Main Branch Behind Remote" : "Uncommitted Changes"}
      </DialogTitle>
      <p class="mb-4 text-sm">{props.info?.message}</p>
      <div class="flex justify-end gap-2">
        <button
          onClick={props.onCancel}
          class="btn-secondary"
          data-testid="ticket-detail-shortcut-confirmation-cancel"
        >
          Cancel
        </button>
        <button
          onClick={() => props.onProceed(props.info!.name)}
          disabled={props.running}
          class="btn-primary"
          data-testid="ticket-detail-shortcut-confirmation-proceed"
        >{props.info?.type === "behindRemote" ? "Proceed" : "Run Anyway"}</button>
      </div>
    </DialogRoot>
  );
}
