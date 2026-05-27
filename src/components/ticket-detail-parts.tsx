import { Show, For } from "solid-js";
import { Portal } from "solid-js/web";
import { DialogRoot, DialogTitle, DialogDescription } from "./ui/dialog";
import MarkdownEditor from "./MarkdownEditor";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import type { MergedLauncherConfig } from "~/server/launcher-config.js";

export type ActiveFile =
  | { type: "context"; name: string }
  | { type: "file"; name: string }
  | { type: "reference"; path: string };

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md"]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isImage(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name));
}

export function isText(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name));
}

export function activeFileLabel(af: ActiveFile): string {
  switch (af.type) {
    case "context": return `${af.name}.md`;
    case "file": return af.name;
    case "reference": {
      const sep = af.path.includes("\\") ? "\\" : "/";
      const parts = af.path.split(sep);
      return parts[parts.length - 1] || af.path;
    }
  }
}

export function isActiveFileMatch(a: ActiveFile, b: ActiveFile): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "reference" && b.type === "reference") return a.path === b.path;
  if (a.type === "context" && b.type === "context") return a.name === b.name;
  if (a.type === "file" && b.type === "file") return a.name === b.name;
  return false;
}

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
    <DialogRoot open={props.open} onOpenChange={props.onCancel} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>Unsaved Changes</DialogTitle>
      <DialogDescription>{props.message}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} class="btn-secondary">Cancel</button>
        <button type="button" onClick={props.onDiscard} title={modEnterHint()} class="btn-destructive">Discard</button>
      </div>
    </DialogRoot>
  );
}

export const TAB_PANE_CLASS = "flex-1 overflow-hidden px-6 pb-4";

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
      <div class="flex items-center gap-2 px-6 py-2">
        <div class="min-w-0 flex-1">
          <button
            ref={(el) => (dropdownBtnRef = el)}
            type="button"
            onClick={() => props.setDropdownOpen(!props.dropdownOpen)}
            class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
          >
            <span class="truncate">
              {activeFileLabel(props.activeFile)}
              {props.activeFile.type === "reference" && (
                <span class="ml-1 text-xs text-muted-foreground">REFERENCE</span>
              )}
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2 shrink-0"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <Show when={props.dropdownOpen}>
            <Portal>
              <div class="fixed inset-0" onClick={() => props.setDropdownOpen(false)} />
              <div
                class="fixed max-h-60 overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
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
                      onClick={() => props.onSelect(option)}
                      class={`flex w-full items-center gap-1 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                        isActiveFileMatch(option, props.activeFile) ? "font-semibold" : ""
                      }`}
                    >
                      <span class="truncate">{activeFileLabel(option)}</span>
                      {option.type === "reference" && (
                        <>
                          <span class="shrink-0 text-xs text-muted-foreground">REFERENCE</span>
                          {props.isStale(option.path) && (
                            <span class="shrink-0" title="File not found on disk">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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
          onClick={props.onTrash}
          class="btn-icon text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          title={props.activeFile.type === "reference" ? "Remove reference" : "Delete file"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 px-6 pb-2">
        <button type="button" onClick={props.onNewFile} class="btn-secondary btn-sm gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New markdown file
        </button>
        <button
          type="button"
          onClick={() => fileInputRef?.click()}
          onDragOver={props.onDragOver}
          onDragLeave={props.onDragLeave}
          onDrop={props.onDrop}
          disabled={props.uploading}
          class={`btn-secondary btn-sm gap-1.5 ${props.dragging ? "border-primary bg-primary/10 text-primary" : ""}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Drop a file to copy
        </button>
        <input ref={(el) => (fileInputRef = el)} type="file" multiple class="hidden" onChange={props.onFileInputChange} />
        <button type="button" onClick={props.onBrowse} disabled={props.browsing} class="btn-secondary btn-sm gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
          Add file reference
        </button>
      </div>
    </>
  );
}

export function EditorPane(props: {
  viewMode: "editor" | "image" | "unsupported";
  content: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  readOnly: boolean;
  imageUrl: string;
  label: string;
}) {
  return (
    <>
      <Show when={props.viewMode === "editor"}>
        <MarkdownEditor value={props.content} onChange={props.onChange} onSave={props.onSave} placeholder="Write markdown here..." readOnly={props.readOnly} />
      </Show>
      <Show when={props.viewMode === "image"}>
        <div class="flex h-full items-center justify-center overflow-auto rounded-md border border-input bg-background p-4">
          <a href={props.imageUrl} target="_blank" rel="noopener noreferrer">
            <img src={props.imageUrl} alt={props.label} class="max-h-full max-w-full cursor-pointer object-contain" />
          </a>
        </div>
      </Show>
      <Show when={props.viewMode === "unsupported"}>
        <div class="flex h-full items-center justify-center rounded-md border border-input bg-background">
          <p class="text-sm text-muted-foreground">Unable to show this file type</p>
        </div>
      </Show>
    </>
  );
}

export function ShortcutsTab(props: {
  config: MergedLauncherConfig | null;
  running: string;
  onRun: (name: string) => void;
}) {
  return (
    <div class="flex h-full flex-col gap-3 overflow-auto py-4">
      <Show when={props.config} fallback={<p class="text-sm text-muted-foreground">Loading config...</p>}>
        {(cfg) => (
          <Show when={cfg().shortcuts.length > 0} fallback={<p class="text-sm text-muted-foreground">No shortcuts configured</p>}>
            <For each={cfg().shortcuts}>
              {(shortcut) => (
                <div class="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium">{shortcut.name}</div>
                    <div class="truncate font-mono text-xs text-muted-foreground">{shortcut.command}</div>
                  </div>
                  <button onClick={() => props.onRun(shortcut.name)} disabled={props.running !== ""} class="btn-primary btn-sm">Run</button>
                </div>
              )}
            </For>
          </Show>
        )}
      </Show>
    </div>
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
    <DialogRoot open={props.open} onOpenChange={props.onClose} onMouseDown={(e: MouseEvent) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
      <DialogTitle>New Markdown File</DialogTitle>
      <label class="mb-1 block text-sm text-muted-foreground">File name (without .md extension)</label>
      <input type="text" value={props.name} onInput={(e) => props.setName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") props.onSubmit(); if (e.key === "Escape") props.onClose(); }} autofocus class="input mb-4" placeholder="e.g. design-notes" />
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onClose} class="btn-secondary">Cancel</button>
        <button type="button" onClick={props.onSubmit} disabled={!props.name.trim()} title={modEnterHint()} class="btn-primary">Create</button>
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
    <DialogRoot open={props.open} onOpenChange={props.onClose} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>Delete File</DialogTitle>
      <DialogDescription>Delete {props.label}? This cannot be undone.</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onClose} class="btn-secondary">Cancel</button>
        <button type="button" onClick={props.onDelete} title={modEnterHint()} class="btn-destructive">Delete</button>
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
    <DialogRoot open={props.open} onOpenChange={props.onCancel} onMouseDown={(e: MouseEvent) => e.preventDefault()}>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogDescription>{props.description}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} class="btn-secondary">Cancel</button>
        <button type="button" onClick={props.onConfirm} class={props.confirmClass}>{props.confirmLabel}</button>
      </div>
    </DialogRoot>
  );
}

export function DirtyWorktreeShortcutDialog(props: {
  info: { name: string; message: string } | null;
  running: boolean;
  onCancel: () => void;
  onRunAnyway: (name: string) => void;
}) {
  return (
    <DialogRoot open={!!props.info} onOpenChange={props.onCancel} class="max-w-sm">
      <DialogTitle class="sr-only">Uncommitted Changes</DialogTitle>
      <p class="mb-4 text-sm">{props.info?.message}</p>
      <div class="flex justify-end gap-2">
        <button onClick={props.onCancel} class="btn-secondary">Cancel</button>
        <button onClick={() => props.onRunAnyway(props.info!.name)} disabled={props.running} class="btn-primary">Run Anyway</button>
      </div>
    </DialogRoot>
  );
}
