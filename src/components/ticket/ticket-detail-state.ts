import { createSignal, createEffect, on, onCleanup } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/server/launcher/launcher-config.js";
import {
  type ActiveFile,
  activeFileLabel,
  isImage,
  isText,
  isActiveFileMatch,
} from "./ticket-detail-parts.js";

export type Tab = "editor" | "launcher" | "shortcuts";

export function createTicketDetailState(props: { ticket: TicketInfo; projectSlug: string; onClose: () => void }) {
  const [activeFile, setActiveFile] = createSignal<ActiveFile>({ type: "context", name: "to-do" });
  const [content, setContent] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<ActiveFile | null>(null);
  const [confirmingFileSwitch, setConfirmingFileSwitch] = createSignal(false);
  const [pendingTab, setPendingTab] = createSignal<Tab | null>(null);
  const [activeTab, setActiveTab] = createSignal<Tab>("editor");
  const [initialTabResolved, setInitialTabResolved] = createSignal(false);
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
  const [runningShortcut, setRunningShortcut] = createSignal("");
  const [dirtyWorktreeShortcut, setDirtyWorktreeShortcut] = createSignal<{ name: string; message: string } | null>(null);
  const [useWorktree, setUseWorktree] = createSignal(props.ticket.useWorktree);
  const [ticketFileNames, setTicketFileNames] = createSignal<string[]>(props.ticket.fileNames ?? []);
  const [ticketReferences, setTicketReferences] = createSignal<{ path: string; exists: boolean }[]>(props.ticket.references ?? []);

  createEffect(on(() => props.ticket.folderName, () => setUseWorktree(props.ticket.useWorktree)));

  function persistWorktree(value: boolean) {
    setUseWorktree(value);
    fetch(
      `/api/projects/${props.projectSlug}/board/tickets/${props.ticket.folderName}/use-worktree`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useWorktree: value }) }
    ).catch((err) => { console.warn("Failed to persist useWorktree:", err); });
  }

  async function runShortcut(name: string, force?: boolean) {
    setRunningShortcut(name);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${props.projectSlug}/board/tickets/${props.ticket.folderName}/shortcut/run`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, useWorktree: useWorktree(), force }) }
      );
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 409) {
          try { const data = JSON.parse(text); if (data.dirtyWorktree) { setDirtyWorktreeShortcut({ name, message: data.message }); return; } } catch { /* Not JSON */ }
        }
        setError(text || `Error ${res.status}`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setRunningShortcut("");
    }
  }

  const contextOptions = (): ActiveFile[] => {
    const defaults = ["to-do", "product-requirement-document"];
    const existing = props.ticket.contextNames ?? [];
    const extra = extraFiles();
    const all = [...defaults];
    for (const name of [...existing, ...extra]) { if (!all.includes(name)) all.push(name); }
    return all.map((name) => ({ type: "context" as const, name }));
  };

  const fileEntryOptions = (): ActiveFile[] =>
    ticketFileNames().filter((n) => !n.endsWith(".md") && n !== "status.json").map((name) => ({ type: "file" as const, name }));

  const referenceOptions = (): ActiveFile[] =>
    ticketReferences().map((ref) => ({ type: "reference" as const, path: ref.path }));

  const allFileOptions = () => [...contextOptions(), ...fileEntryOptions(), ...referenceOptions()];

  function isCurrentReadOnly(): boolean {
    const af = activeFile();
    return af.type === "reference" || af.type === "file";
  }

  function isReferenceStale(refPath: string): boolean {
    const ref = ticketReferences().find((r) => r.path === refPath);
    return ref ? !ref.exists : false;
  }

  const hasUnsavedChanges = () => activeTab() === "editor" && fileViewMode() === "editor" && !isCurrentReadOnly() && content() !== savedContent();

  function handleBeforeUnload(e: BeforeUnloadEvent) { if (hasUnsavedChanges()) e.preventDefault(); }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleBeforeUnload);
    onCleanup(() => window.removeEventListener("beforeunload", handleBeforeUnload));
  }

  function ticketUrl(suffix: string): string {
    return `/api/projects/${props.projectSlug}/board/tickets/${props.ticket.folderName}/${suffix}`;
  }

  async function loadTextContent(url: string): Promise<void> {
    setFileViewMode("editor");
    try {
      const res = await fetch(url);
      if (res.ok) { const text = await res.text(); setContent(text); setSavedContent(text); }
      else { setContent(""); setSavedContent(""); }
    } catch (e) { setContent(""); setSavedContent(""); setError(e instanceof Error ? e.message : "Failed to load file"); }
  }

  function loadFileByName(fileName: string, url: string): void {
    if (isImage(fileName)) { setFileViewMode("image"); setImageUrl(url); setContent(""); setSavedContent(""); }
    else if (isText(fileName)) { loadTextContent(url); }
    else { setFileViewMode("unsupported"); setContent(""); setSavedContent(""); }
  }

  createEffect(on(
    () => [props.projectSlug, props.ticket.folderName] as const,
    async ([projectSlug]) => {
      if (!projectSlug) return;
      try {
        const res = await fetch(`/api/projects/${projectSlug}/launcher-config`);
        if (res.ok) {
          const data: MergedLauncherConfig = await res.json();
          setLauncherConfig(data);
          const defaults = data.columnDefaults[props.ticket.status];
          if (defaults?.lastLayer === "launcher" || defaults?.lastLayer === "shortcuts") setActiveTab(defaults.lastLayer);
        } else {
          setError((await res.text()) || `Failed to load launcher config (${res.status})`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load launcher config");
      } finally {
        setInitialTabResolved(true);
      }
    }
  ));

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    fetch(`/api/projects/${props.projectSlug}/launcher-config/column-defaults`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column: props.ticket.status, ...patch }),
    }).catch((e) => { console.warn("Failed to save column defaults:", e); });
  }

  createEffect(on(activeFile, async (af) => {
    if (activeTab() !== "editor") return;
    setError(""); setImageUrl("");
    if (af.type === "context") {
      setFileViewMode("editor");
      try {
        const res = await fetch(ticketUrl(`context/${af.name}`));
        if (res.ok) { const data = await res.json(); setContent(data.content); setSavedContent(data.content); }
        else { setContent(""); setSavedContent(""); }
      } catch (e) { setContent(""); setSavedContent(""); setError(e instanceof Error ? e.message : "Failed to load file"); }
    } else if (af.type === "file") {
      loadFileByName(af.name, ticketUrl(`files/${encodeURIComponent(af.name)}`));
    } else if (af.type === "reference") {
      loadFileByName(activeFileLabel(af), ticketUrl(`references/content?path=${encodeURIComponent(af.path)}`));
    }
  }));

  async function saveFile() {
    const af = activeFile();
    if (af.type !== "context") return;
    setSaving(true);
    try {
      await fetch(ticketUrl(`context/${af.name}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content() }) });
      setSavedContent(content());
      revalidate("board-data");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save file"); }
    finally { setSaving(false); }
  }

  function requestFileSwitch(file: ActiveFile) {
    if (isActiveFileMatch(file, activeFile()) && activeTab() === "editor") return;
    if (hasUnsavedChanges()) { setPendingFile(file); setConfirmingFileSwitch(true); return; }
    setActiveTab("editor");
    if (!isActiveFileMatch(file, activeFile())) setActiveFile(file);
  }

  function switchTab(tab: Tab) {
    if (tab === activeTab()) return;
    if (tab !== "editor") {
      if (hasUnsavedChanges()) { setPendingFile(null); setPendingTab(tab); setConfirmingFileSwitch(true); return; }
      setActiveTab(tab);
      if (tab === "launcher" || tab === "shortcuts") patchColumnDefaults({ lastLayer: tab });
    } else { setActiveTab("editor"); patchColumnDefaults({ lastLayer: "editor" }); }
  }

  function proceedFileSwitch() {
    const file = pendingFile(); const toTab = pendingTab();
    setConfirmingFileSwitch(false); setPendingFile(null); setPendingTab(null);
    if (toTab) { setActiveTab(toTab); if (toTab === "launcher" || toTab === "shortcuts") patchColumnDefaults({ lastLayer: toTab }); }
    else if (file) { setActiveTab("editor"); setActiveFile(file); }
  }

  function selectFile(af: ActiveFile) { setDropdownOpen(false); requestFileSwitch(af); }

  function openNewFileDialog() { setDropdownOpen(false); setNewFileName(""); setNewFileDialogOpen(true); }

  function submitNewFile() {
    const raw = newFileName().trim();
    if (!raw) return;
    const contextFileName = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!contextFileName) return;
    setNewFileDialogOpen(false);
    if (!contextOptions().some((o) => o.type === "context" && o.name === contextFileName)) setExtraFiles((prev) => [...prev, contextFileName]);
    requestFileSwitch({ type: "context", name: contextFileName });
  }

  async function deleteOrRemoveFile() {
    const af = activeFile();
    setConfirmingDelete(false);
    let url: string, errorLabel: string, fetchOpts: RequestInit;
    if (af.type === "reference") { url = ticketUrl("references"); errorLabel = "Failed to remove reference"; fetchOpts = { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: af.path }) }; }
    else if (af.type === "file") { url = ticketUrl(`files/${encodeURIComponent(af.name)}`); errorLabel = "Failed to delete file"; fetchOpts = { method: "DELETE" }; }
    else { url = ticketUrl(`context/${af.name}`); errorLabel = "Failed to delete file"; fetchOpts = { method: "DELETE" }; }
    try {
      const res = await fetch(url, fetchOpts);
      if (!res.ok) { setError(await res.text() || errorLabel); return; }
      if (af.type === "reference") setTicketReferences((prev) => prev.filter((r) => r.path !== af.path));
      else if (af.type === "file") setTicketFileNames((prev) => prev.filter((n) => n !== af.name));
      else setExtraFiles((prev) => prev.filter((n) => n !== af.name));
      revalidate("board-data");
      const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
      setActiveFile(remaining[0] ?? { type: "context", name: "to-do" });
    } catch (e) { setError(e instanceof Error ? e.message : errorLabel); }
  }

  function handleTrashClick() {
    if (activeFile().type === "reference") deleteOrRemoveFile();
    else setConfirmingDelete(true);
  }

  function close() { if (hasUnsavedChanges()) { setConfirmingClose(true); return; } props.onClose(); }
  function forceClose() { setConfirmingClose(false); props.onClose(); }

  function handleDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation(); setDragging(true); }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); e.stopPropagation(); setDragging(false); }

  async function handleDrop(e: DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) await processFileForUpload(files[i]);
  }

  async function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) await processFileForUpload(files[i]);
    input.value = "";
  }

  function wouldOverwrite(fileName: string): boolean {
    const allExisting = [...ticketFileNames(), ...(props.ticket.contextNames ?? []).map((s) => `${s}.md`)];
    return allExisting.includes(fileName);
  }

  async function processFileForUpload(file: File) {
    if (file.name === "status.json") { setError("Cannot overwrite status.json"); return; }
    if (file.size > 10240) { setConfirmSize({ fileName: file.name, file, size: file.size }); await new Promise<void>((resolve) => setConfirmResolver(() => resolve)); return; }
    if (wouldOverwrite(file.name)) { setConfirmOverwrite({ fileName: file.name, file }); await new Promise<void>((resolve) => setConfirmResolver(() => resolve)); return; }
    await uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true); setError("");
    try {
      const formData = new FormData(); formData.append("file", file);
      const res = await fetch(ticketUrl("files/upload"), { method: "POST", body: formData });
      if (!res.ok) { setError(await res.text() || "Upload failed"); return; }
      const data = await res.json();
      for (const result of data.results) {
        if (result.ok) { setTicketFileNames((prev) => prev.includes(result.name) ? prev : [...prev, result.name].sort()); }
        else { setError(result.error || `Failed to upload ${result.name}`); }
      }
      revalidate("board-data");
      if (file.name.endsWith(".md")) requestFileSwitch({ type: "context", name: file.name.replace(/\.md$/, "") });
      else requestFileSwitch({ type: "file", name: file.name });
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  }

  async function confirmSizeAndUpload() {
    const info = confirmSize(); const resolver = confirmResolver();
    setConfirmSize(null); setConfirmResolver(null);
    if (!info) return;
    if (wouldOverwrite(info.file.name)) { setConfirmOverwrite({ fileName: info.file.name, file: info.file }); await new Promise<void>((resolve) => setConfirmResolver(() => resolve)); resolver?.(); return; }
    await uploadFile(info.file); resolver?.();
  }

  async function confirmOverwriteAndUpload() {
    const info = confirmOverwrite(); const resolver = confirmResolver();
    setConfirmOverwrite(null); setConfirmResolver(null);
    if (!info) return;
    await uploadFile(info.file); resolver?.();
  }

  async function openNativeFileBrowser() {
    setBrowsing(true); setError("");
    try {
      const res = await fetch("/api/browse", { method: "POST" });
      if (!res.ok) { setError(await res.text() || "Failed to open file dialog"); return; }
      const data = await res.json();
      const paths: string[] = data.paths ?? [];
      if (paths.length === 0) return;
      await handleReferencesSelected(paths);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to open file dialog"); }
    finally { setBrowsing(false); }
  }

  async function handleReferencesSelected(paths: string[]) {
    setError("");
    try {
      const res = await fetch(ticketUrl("references"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
      if (!res.ok) { setError(await res.text() || "Failed to add references"); return; }
      const newRefs = paths.map((p) => ({ path: p, exists: true }));
      setTicketReferences((prev) => { const existing = new Set(prev.map((r) => r.path)); return [...prev, ...newRefs.filter((r) => !existing.has(r.path))]; });
      revalidate("board-data");
      if (paths.length > 0) requestFileSwitch({ type: "reference", path: paths[0] });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add references"); }
  }

  const showSaveButton = () => activeTab() === "editor" && activeFile().type === "context";

  return {
    activeFile, content, setContent, saving, confirmingClose, setConfirmingClose,
    confirmingFileSwitch, activeTab, initialTabResolved, launcherConfig,
    newFileDialogOpen, setNewFileDialogOpen, newFileName, setNewFileName,
    confirmingDelete, setConfirmingDelete, error, dropdownOpen, setDropdownOpen,
    browsing, dragging, imageUrl, fileViewMode, uploading,
    confirmOverwrite, confirmSize, runningShortcut, dirtyWorktreeShortcut, setDirtyWorktreeShortcut,
    useWorktree, allFileOptions, isReferenceStale, hasUnsavedChanges, isCurrentReadOnly,
    showSaveButton, persistWorktree, runShortcut, switchTab, selectFile, openNewFileDialog,
    submitNewFile, deleteOrRemoveFile, handleTrashClick, close, forceClose,
    proceedFileSwitch, cancelFileSwitch: () => { setConfirmingFileSwitch(false); setPendingFile(null); },
    handleDragOver, handleDragLeave, handleDrop, handleFileInputChange,
    confirmSizeAndUpload, confirmOverwriteAndUpload, openNativeFileBrowser,
    cancelSizeConfirm: () => { const r = confirmResolver(); setConfirmSize(null); setConfirmResolver(null); r?.(); },
    cancelOverwriteConfirm: () => { const r = confirmResolver(); setConfirmOverwrite(null); setConfirmResolver(null); r?.(); },
    saveFile, patchColumnDefaults,
  };
}
