import { createSignal, createEffect, Show, For, on, onCleanup } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo, MergedLauncherConfig, LauncherColumnDefaults } from "~/types.js";
import AgentLauncher from "./AgentLauncher";
import ResizableWindow from "./ResizableWindow";
import MarkdownEditor from "./MarkdownEditor";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

type ActiveFile =
  | { type: "stage"; name: string }
  | { type: "file"; name: string }
  | { type: "reference"; path: string };

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md"]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isImage(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name));
}

function isText(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name));
}

function activeFileLabel(af: ActiveFile): string {
  switch (af.type) {
    case "stage": return `${af.name}.md`;
    case "file": return af.name;
    case "reference": {
      const sep = af.path.includes("\\") ? "\\" : "/";
      const parts = af.path.split(sep);
      return parts[parts.length - 1] || af.path;
    }
  }
}

function DiscardConfirmation(props: {
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
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => e.preventDefault()}>
        <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-semibold">Unsaved Changes</h2>
          <p class="mb-4 text-sm text-muted-foreground">{props.message}</p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={props.onCancel}
              class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onDiscard}
              title={modEnterHint()}
              class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

interface TicketDetailDialogProps {
  onClose: () => void;
  slug: string;
  ticket: TicketInfo | null;
}

export default function TicketDetailDialog(props: TicketDetailDialogProps) {
  return (
    <Show when={props.ticket} keyed>
      {(ticket) => (
        <TicketDetailContent
          ticket={ticket}
          onClose={props.onClose}
          slug={props.slug}
        />
      )}
    </Show>
  );
}

function TicketDetailContent(props: {
  ticket: TicketInfo;
  onClose: () => void;
  slug: string;
}) {
  const [activeFile, setActiveFile] = createSignal<ActiveFile>({ type: "stage", name: "to-do" });
  const [content, setContent] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<ActiveFile | null>(null);
  const [confirmingFileSwitch, setConfirmingFileSwitch] = createSignal(false);
  const [pendingAiSwitch, setPendingAiSwitch] = createSignal(false);
  const [showAiConsole, setShowAiConsole] = createSignal(false);
  const [launcherConfig, setLauncherConfig] = createSignal<MergedLauncherConfig | null>(null);
  const [extraFiles, setExtraFiles] = createSignal<string[]>([]);
  const [newFileDialogOpen, setNewFileDialogOpen] = createSignal(false);
  const [newFileName, setNewFileName] = createSignal("");
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [error, setError] = createSignal("");
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [browsing, setBrowsing] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [imageUrl, setImageUrl] = createSignal("");
  const [fileViewMode, setFileViewMode] = createSignal<"editor" | "image" | "unsupported">("editor");
  const [uploading, setUploading] = createSignal(false);
  const [confirmOverwrite, setConfirmOverwrite] = createSignal<{ fileName: string; file: File } | null>(null);
  const [confirmSize, setConfirmSize] = createSignal<{ fileName: string; file: File; size: number } | null>(null);
  const [confirmResolver, setConfirmResolver] = createSignal<(() => void) | null>(null);
  const [ticketFileNames, setTicketFileNames] = createSignal<string[]>(props.ticket.fileNames ?? []);
  const [ticketReferences, setTicketReferences] = createSignal<{ path: string; exists: boolean }[]>(props.ticket.references ?? []);

  useModEnterSubmit({
    onSubmit: submitNewFile,
    disabled: () => !newFileName().trim(),
    active: () => newFileDialogOpen(),
  });

  useModEnterSubmit({
    onSubmit: deleteOrRemoveFile,
    disabled: () => false,
    active: () => confirmingDelete(),
  });

  useModEnterSubmit({
    onSubmit: saveFile,
    disabled: () => saving() || !hasUnsavedChanges(),
    active: () =>
      !showAiConsole() &&
      !newFileDialogOpen() &&
      !confirmingDelete() &&
      !confirmingFileSwitch() &&
      !confirmingClose() &&
      fileViewMode() === "editor" &&
      !isCurrentReadOnly(),
  });

  const stageOptions = (): ActiveFile[] => {
    const defaults = ["to-do", "product-requirement-document"];
    const existing = props.ticket.stageNames ?? [];
    const extra = extraFiles();
    const all = [...defaults];
    for (const name of [...existing, ...extra]) {
      if (!all.includes(name)) {
        all.push(name);
      }
    }
    return all.map((name) => ({ type: "stage" as const, name }));
  };

  const fileEntryOptions = (): ActiveFile[] => {
    const names = ticketFileNames();
    // Exclude .md files (those are already stages) and status.json
    return names
      .filter((n) => !n.endsWith(".md") && n !== "status.json")
      .map((name) => ({ type: "file" as const, name }));
  };

  const referenceOptions = (): ActiveFile[] => {
    return ticketReferences().map((ref) => ({ type: "reference" as const, path: ref.path }));
  };

  const allFileOptions = () => [...stageOptions(), ...fileEntryOptions(), ...referenceOptions()];

  function isActiveFileMatch(a: ActiveFile, b: ActiveFile): boolean {
    if (a.type !== b.type) return false;
    if (a.type === "reference" && b.type === "reference") return a.path === b.path;
    if (a.type === "stage" && b.type === "stage") return a.name === b.name;
    if (a.type === "file" && b.type === "file") return a.name === b.name;
    return false;
  }

  function isCurrentReadOnly(): boolean {
    const af = activeFile();
    return af.type === "reference" || af.type === "file";
  }

  function isReferenceStale(refPath: string): boolean {
    const refs = ticketReferences();
    const ref = refs.find((r) => r.path === refPath);
    return ref ? !ref.exists : false;
  }

  const hasUnsavedChanges = () => !showAiConsole() && fileViewMode() === "editor" && !isCurrentReadOnly() && content() !== savedContent();

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasUnsavedChanges()) {
      e.preventDefault();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleBeforeUnload);
    onCleanup(() => window.removeEventListener("beforeunload", handleBeforeUnload));
  }

  function ticketUrl(suffix: string): string {
    return `/api/projects/${props.slug}/board/tickets/${props.ticket.folderName}/${suffix}`;
  }

  async function loadTextContent(url: string): Promise<void> {
    setFileViewMode("editor");
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        setContent(text);
        setSavedContent(text);
      } else {
        setContent("");
        setSavedContent("");
      }
    } catch (e) {
      setContent("");
      setSavedContent("");
      setError(e instanceof Error ? e.message : "Failed to load file");
    }
  }

  function showImage(url: string): void {
    setFileViewMode("image");
    setImageUrl(url);
    setContent("");
    setSavedContent("");
  }

  function showUnsupported(): void {
    setFileViewMode("unsupported");
    setContent("");
    setSavedContent("");
  }

  function loadFileByName(fileName: string, url: string): void {
    if (isImage(fileName)) {
      showImage(url);
    } else if (isText(fileName)) {
      loadTextContent(url);
    } else {
      showUnsupported();
    }
  }

  createEffect(
    on(
      () => [props.slug, props.ticket.folderName] as const,
      async ([slug]) => {
        if (!slug) return;
        try {
          const res = await fetch(`/api/projects/${slug}/launcher-config`);
          if (res.ok) {
            const data: MergedLauncherConfig = await res.json();
            setLauncherConfig(data);
            const defaults = data.columnDefaults[props.ticket.status];
            if (defaults?.lastLayer === "launcher") {
              setShowAiConsole(true);
            }
          }
        } catch {}
      }
    )
  );

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    fetch(`/api/projects/${props.slug}/launcher-config/column-defaults`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column: props.ticket.status, ...patch }),
    }).catch(() => {});
  }

  createEffect(
    on(activeFile, async (af) => {
      if (showAiConsole()) return;
      setError("");
      setImageUrl("");

      if (af.type === "stage") {
        setFileViewMode("editor");
        try {
          const res = await fetch(ticketUrl(`stages/${af.name}`));
          if (res.ok) {
            const data = await res.json();
            setContent(data.content);
            setSavedContent(data.content);
          } else {
            setContent("");
            setSavedContent("");
          }
        } catch (e) {
          setContent("");
          setSavedContent("");
          setError(e instanceof Error ? e.message : "Failed to load file");
        }
      } else if (af.type === "file") {
        loadFileByName(af.name, ticketUrl(`files/${encodeURIComponent(af.name)}`));
      } else if (af.type === "reference") {
        const fileName = activeFileLabel(af);
        loadFileByName(fileName, ticketUrl(`references/content?path=${encodeURIComponent(af.path)}`));
      }
    })
  );

  async function saveFile() {
    const af = activeFile();
    if (af.type !== "stage") return;
    setSaving(true);
    try {
      await fetch(ticketUrl(`stages/${af.name}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content() }),
        }
      );
      setSavedContent(content());
      revalidate("board-data");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }

  function requestFileSwitch(file: ActiveFile) {
    if (isActiveFileMatch(file, activeFile()) && !showAiConsole()) return;
    if (hasUnsavedChanges()) {
      setPendingFile(file);
      setConfirmingFileSwitch(true);
      return;
    }
    setShowAiConsole(false);
    if (!isActiveFileMatch(file, activeFile())) {
      setActiveFile(file);
    }
  }

  function toggleAiConsole() {
    if (showAiConsole()) {
      setShowAiConsole(false);
      patchColumnDefaults({ lastLayer: "editor" });
      return;
    }
    if (hasUnsavedChanges()) {
      setPendingFile(null);
      setPendingAiSwitch(true);
      setConfirmingFileSwitch(true);
      return;
    }
    setShowAiConsole(true);
    patchColumnDefaults({ lastLayer: "launcher" });
  }

  function proceedFileSwitch() {
    const file = pendingFile();
    const toAi = pendingAiSwitch();
    setConfirmingFileSwitch(false);
    setPendingFile(null);
    setPendingAiSwitch(false);
    if (toAi) {
      setShowAiConsole(true);
      patchColumnDefaults({ lastLayer: "launcher" });
    } else if (file) {
      setShowAiConsole(false);
      setActiveFile(file);
    }
  }

  function cancelFileSwitch() {
    setConfirmingFileSwitch(false);
    setPendingFile(null);
  }

  function selectFile(af: ActiveFile) {
    setDropdownOpen(false);
    requestFileSwitch(af);
  }

  function openNewFileDialog() {
    setDropdownOpen(false);
    setNewFileName("");
    setNewFileDialogOpen(true);
  }

  function submitNewFile() {
    const raw = newFileName().trim();
    if (!raw) return;
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) return;
    setNewFileDialogOpen(false);
    if (!stageOptions().some((o) => o.type === "stage" && o.name === slug)) {
      setExtraFiles((prev) => [...prev, slug]);
    }
    requestFileSwitch({ type: "stage", name: slug });
  }

  async function deleteOrRemoveFile() {
    const af = activeFile();
    setConfirmingDelete(false);

    if (af.type === "reference") {
      try {
        const res = await fetch(ticketUrl("references"), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: af.path }),
        });
        if (!res.ok) throw new Error(await res.text() || "Failed to remove reference");
        setTicketReferences((prev) => prev.filter((r) => r.path !== af.path));
        revalidate("board-data");
        const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
        setActiveFile(remaining[0] ?? { type: "stage", name: "to-do" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove reference");
      }
    } else if (af.type === "file") {
      try {
        const res = await fetch(ticketUrl(`files/${encodeURIComponent(af.name)}`), { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text() || "Failed to delete file");
        setTicketFileNames((prev) => prev.filter((n) => n !== af.name));
        revalidate("board-data");
        const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
        setActiveFile(remaining[0] ?? { type: "stage", name: "to-do" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete file");
      }
    } else {
      try {
        const res = await fetch(ticketUrl(`stages/${af.name}`), { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text() || "Failed to delete file");
        setExtraFiles((prev) => prev.filter((n) => n !== af.name));
        revalidate("board-data");
        const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
        setActiveFile(remaining[0] ?? { type: "stage", name: "to-do" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete file");
      }
    }
  }

  function handleTrashClick() {
    if (activeFile().type === "reference") {
      deleteOrRemoveFile();
    } else {
      setConfirmingDelete(true);
    }
  }

  function close() {
    if (hasUnsavedChanges()) {
      setConfirmingClose(true);
      return;
    }
    props.onClose();
  }

  function forceClose() {
    setConfirmingClose(false);
    props.onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (dropdownOpen()) {
        setDropdownOpen(false);
        e.preventDefault();
      } else if (confirmingFileSwitch()) {
        cancelFileSwitch();
        e.preventDefault();
      } else if (confirmingClose()) {
        setConfirmingClose(false);
        e.preventDefault();
      }
    }
  }

  // File drop handling
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await processFileForUpload(files[i]);
    }
  }

  async function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await processFileForUpload(files[i]);
    }
    input.value = "";
  }

  function wouldOverwrite(fileName: string): boolean {
    const existingFiles = ticketFileNames();
    const stages = props.ticket.stageNames ?? [];
    const allExisting = [...existingFiles, ...stages.map((s) => `${s}.md`)];
    return allExisting.includes(fileName);
  }

  async function processFileForUpload(file: File) {
    if (file.name === "status.json") {
      setError("Cannot overwrite status.json");
      return;
    }

    // Check size warning (10 KB)
    if (file.size > 10240) {
      setConfirmSize({ fileName: file.name, file, size: file.size });
      await new Promise<void>((resolve) => setConfirmResolver(() => resolve));
      return;
    }

    if (wouldOverwrite(file.name)) {
      setConfirmOverwrite({ fileName: file.name, file });
      await new Promise<void>((resolve) => setConfirmResolver(() => resolve));
      return;
    }

    await uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(ticketUrl("files/upload"), { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text();
        setError(text || "Upload failed");
        return;
      }
      const data = await res.json();
      for (const result of data.results) {
        if (result.ok) {
          setTicketFileNames((prev) => {
            if (prev.includes(result.name)) return prev;
            return [...prev, result.name].sort();
          });
        } else {
          setError(result.error || `Failed to upload ${result.name}`);
        }
      }
      revalidate("board-data");
      // Select the uploaded file
      if (file.name.endsWith(".md")) {
        const stageName = file.name.replace(/\.md$/, "");
        requestFileSwitch({ type: "stage", name: stageName });
      } else {
        requestFileSwitch({ type: "file", name: file.name });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function confirmSizeAndUpload() {
    const info = confirmSize();
    const resolver = confirmResolver();
    setConfirmSize(null);
    setConfirmResolver(null);
    if (!info) return;

    if (wouldOverwrite(info.file.name)) {
      setConfirmOverwrite({ fileName: info.file.name, file: info.file });
      await new Promise<void>((resolve) => setConfirmResolver(() => resolve));
      resolver?.();
      return;
    }

    await uploadFile(info.file);
    resolver?.();
  }

  async function confirmOverwriteAndUpload() {
    const info = confirmOverwrite();
    const resolver = confirmResolver();
    setConfirmOverwrite(null);
    setConfirmResolver(null);
    if (!info) return;
    await uploadFile(info.file);
    resolver?.();
  }

  async function openNativeFileBrowser() {
    setBrowsing(true);
    setError("");
    try {
      const res = await fetch("/api/browse", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        setError(text || "Failed to open file dialog");
        return;
      }
      const data = await res.json();
      const paths: string[] = data.paths ?? [];
      if (paths.length === 0) return;
      await handleReferencesSelected(paths);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open file dialog");
    } finally {
      setBrowsing(false);
    }
  }

  async function handleReferencesSelected(paths: string[]) {
    setError("");
    try {
      const res = await fetch(ticketUrl("references"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) {
        setError(await res.text() || "Failed to add references");
        return;
      }
      const newRefs = paths.map((p) => ({ path: p, exists: true }));
      setTicketReferences((prev) => {
        const existing = new Set(prev.map((r) => r.path));
        const added = newRefs.filter((r) => !existing.has(r.path));
        return [...prev, ...added];
      });
      revalidate("board-data");
      if (paths.length > 0) {
        requestFileSwitch({ type: "reference", path: paths[0] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add references");
    }
  }

  let fileInputRef: HTMLInputElement | undefined;

  const showSaveButton = () => !showAiConsole() && activeFile().type === "stage";

  return (
    <>
      <ResizableWindow
        open={true}
        onClose={close}
        onKeyDown={handleKeyDown}
        storageKey="ticket-dialog-size"
        title={
          <div class="flex items-end justify-between">
            <h2 class="text-lg font-semibold">
              {props.ticket.number} - {props.ticket.title}
            </h2>
            <button
              type="button"
              onClick={toggleAiConsole}
              onMouseDown={(e) => e.stopPropagation()}
              class={`inline-flex h-10 shrink-0 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                showAiConsole()
                  ? "bg-primary text-primary-foreground"
                  : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {showAiConsole() ? "File Editor ›" : "Agent Launcher ›"}
            </button>
          </div>
        }
        footer={
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Close
            </button>
            <Show when={showSaveButton()}>
              <button
                type="button"
                onClick={saveFile}
                disabled={saving() || !hasUnsavedChanges()}
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Save
              </button>
            </Show>
          </div>
        }
      >
        <div class="flex h-full flex-col">
          <Show when={!showAiConsole()}>
            {/* File selector row */}
            <div class="flex items-center gap-2 px-4 py-2">
              <div class="relative min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen())}
                  class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                >
                  <span class="truncate">
                    {activeFileLabel(activeFile())}
                    {activeFile().type === "reference" && (
                      <span class="ml-1 text-xs text-muted-foreground">REFERENCE</span>
                    )}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2 shrink-0"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <Show when={dropdownOpen()}>
                  <div class="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div class="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md">
                    <For each={allFileOptions()}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() => selectFile(option)}
                          class={`flex w-full items-center gap-1 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                            isActiveFileMatch(option, activeFile()) ? "font-semibold" : ""
                          }`}
                        >
                          <span class="truncate">{activeFileLabel(option)}</span>
                          {option.type === "reference" && (
                            <>
                              <span class="shrink-0 text-xs text-muted-foreground">REFERENCE</span>
                              {isReferenceStale(option.path) && (
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
                </Show>
              </div>
              <button
                type="button"
                onClick={handleTrashClick}
                class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-2 text-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                title={activeFile().type === "reference" ? "Remove reference" : "Delete file"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>

            {/* Action buttons row */}
            <div class="flex flex-wrap items-center gap-2 px-4 pb-2">
              <button
                type="button"
                onClick={openNewFileDialog}
                class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New markdown file
              </button>

              <button
                type="button"
                onClick={() => fileInputRef?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                disabled={uploading()}
                class={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                  dragging()
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Drop a file to copy
              </button>
              <input
                ref={(el) => (fileInputRef = el)}
                type="file"
                multiple
                class="hidden"
                onChange={handleFileInputChange}
              />

              <button
                type="button"
                onClick={openNativeFileBrowser}
                disabled={browsing()}
                class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                Add file reference
              </button>
            </div>
          </Show>

          <Show when={error()}>
            <div class="mx-4 mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error()}
            </div>
          </Show>

          <div class="flex-1 overflow-hidden px-4 pb-2">
            <Show when={!showAiConsole()} fallback={
              <AgentLauncher slug={props.slug} ticket={props.ticket} config={launcherConfig()} onDefaultsChange={patchColumnDefaults} />
            }>
              <Show when={fileViewMode() === "editor"}>
                <MarkdownEditor
                  value={content()}
                  onChange={setContent}
                  onSave={activeFile().type === "stage" ? saveFile : undefined}
                  placeholder="Write markdown here..."
                  readOnly={isCurrentReadOnly()}
                />
              </Show>
              <Show when={fileViewMode() === "image"}>
                <div class="flex h-full items-center justify-center overflow-auto rounded-md border border-input bg-background p-4">
                  <a href={imageUrl()} target="_blank" rel="noopener noreferrer">
                    <img src={imageUrl()} alt={activeFileLabel(activeFile())} class="max-h-full max-w-full cursor-pointer object-contain" />
                  </a>
                </div>
              </Show>
              <Show when={fileViewMode() === "unsupported"}>
                <div class="flex h-full items-center justify-center rounded-md border border-input bg-background">
                  <p class="text-sm text-muted-foreground">Unable to show this file type</p>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </ResizableWindow>

      <DiscardConfirmation
        open={confirmingClose()}
        message="You have unsaved changes. Discard them?"
        onCancel={() => setConfirmingClose(false)}
        onDiscard={forceClose}
      />

      <DiscardConfirmation
        open={confirmingFileSwitch()}
        message="You have unsaved changes. Discard them and switch files?"
        onCancel={cancelFileSwitch}
        onDiscard={proceedFileSwitch}
      />

      <Show when={newFileDialogOpen()}>
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
          <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 class="mb-4 text-lg font-semibold">New Markdown File</h2>
            <label class="mb-1 block text-sm text-muted-foreground">
              File name (without .md extension)
            </label>
            <input
              type="text"
              value={newFileName()}
              onInput={(e) => setNewFileName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewFile();
                if (e.key === "Escape") setNewFileDialogOpen(false);
              }}
              autofocus
              class="mb-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. design-notes"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFileDialogOpen(false)}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitNewFile}
                disabled={!newFileName().trim()}
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={confirmingDelete()}>
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => e.preventDefault()}>
          <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 class="mb-4 text-lg font-semibold">Delete File</h2>
            <p class="mb-4 text-sm text-muted-foreground">
              Delete {activeFileLabel(activeFile())}? This cannot be undone.
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteOrRemoveFile}
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={confirmOverwrite()}>
        {(info) => (
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => e.preventDefault()}>
            <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
              <h2 class="mb-4 text-lg font-semibold">Overwrite File</h2>
              <p class="mb-4 text-sm text-muted-foreground">
                A file named "{info().fileName}" already exists. Overwrite it?
              </p>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { const r = confirmResolver(); setConfirmOverwrite(null); setConfirmResolver(null); r?.(); }}
                  class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmOverwriteAndUpload}
                  class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  Overwrite
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={confirmSize()}>
        {(info) => (
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => e.preventDefault()}>
            <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
              <h2 class="mb-4 text-lg font-semibold">Large File</h2>
              <p class="mb-4 text-sm text-muted-foreground">
                "{info().fileName}" is {(info().size / 1024).toFixed(1)} KB, which is larger than 10 KB. Copy it anyway?
              </p>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { const r = confirmResolver(); setConfirmSize(null); setConfirmResolver(null); r?.(); }}
                  class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSizeAndUpload}
                  class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Copy Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

    </>
  );
}
