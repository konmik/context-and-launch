import { createSignal, createEffect, on, onCleanup } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/core/launcher/launcher-config.js";
import {
  type ActiveFile,
  activeFileLabel,
  isActiveFileMatch,
  buildContextOptions,
  buildFileEntryOptions,
  buildReferenceOptions,
  buildAllFileOptions,
  isReadOnly,
  checkReferenceStale,
  hasUnsavedEditorChanges,
  normalizeLineEndings,
  slugifyFileName,
  ticketApiUrl,
  resolveFileViewMode,
  showSaveButton as showSaveButtonPure,
} from "./ticket-detail-pure.js";
import { createFileUploadState } from "./ticket-detail-upload.js";
import { createHeaderEditState } from "./ticket-detail-header.js";
import { createShortcutState } from "./ticket-detail-shortcuts.js";
import {
  getContext, saveContext as saveContextAction,
  deleteContext as deleteContextAction, deleteFile as deleteFileAction,
  removeReference as removeReferenceAction, setUseWorktree as setUseWorktreeAction,
  addReferences as addReferencesAction,
} from "./ticket-api.js";
import { getMergedLauncherConfig, saveColumnDefaults } from "../launcher/launcher-api.js";
import { openNativeFileBrowser as openNativeFileBrowserServer } from "../shared/shared-api.js";

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
  const [imageUrl, setImageUrl] = createSignal("");
  const [fileViewMode, setFileViewMode] = createSignal<"editor" | "image" | "unsupported">("editor");
  const [useWorktree, setUseWorktree] = createSignal(props.ticket.useWorktree);
  const [ticketFileNames, setTicketFileNames] = createSignal<string[]>(props.ticket.fileNames ?? []);
  const [ticketReferences, setTicketReferences] = createSignal<
    { path: string; exists: boolean }[]
  >(props.ticket.references ?? []);

  const header = createHeaderEditState({
    projectSlug: props.projectSlug,
    ticket: props.ticket,
    setError,
  });

  function ticketUrl(suffix: string): string {
    return ticketApiUrl(props.projectSlug, header.savedFolderName(), suffix);
  }

  const shortcuts = createShortcutState({
    projectSlug: props.projectSlug,
    folderName: header.savedFolderName,
    useWorktree,
    setError,
  });

  const upload = createFileUploadState({
    projectSlug: props.projectSlug,
    folderName: header.savedFolderName,
    setError,
    ticketFileNames, setTicketFileNames,
    contextNames: props.ticket.contextNames ?? [],
    requestFileSwitch,
  });

  createEffect(on(
    () => props.ticket.folderName,
    () => setUseWorktree(props.ticket.useWorktree),
  ));

  function persistWorktree(value: boolean) {
    setUseWorktree(value);
    setUseWorktreeAction(props.projectSlug, header.savedFolderName(), value)
      .then((result) => {
        if (!result.ok) setError(result.message);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to persist worktree setting");
      });
  }

  const contextOptions = (): ActiveFile[] =>
    buildContextOptions(
      ["to-do", "product-requirement-document"],
      props.ticket.contextNames ?? [],
      extraFiles(),
    );

  const fileEntryOptions = (): ActiveFile[] =>
    buildFileEntryOptions(ticketFileNames());

  const referenceOptions = (): ActiveFile[] =>
    buildReferenceOptions(ticketReferences());

  const allFileOptions = () =>
    buildAllFileOptions(contextOptions(), fileEntryOptions(), referenceOptions());

  function isCurrentReadOnly(): boolean {
    return isReadOnly(activeFile());
  }

  function isReferenceStale(refPath: string): boolean {
    return checkReferenceStale(ticketReferences(), refPath);
  }

  const hasUnsavedFileChanges = () =>
    hasUnsavedEditorChanges(
      activeTab(), fileViewMode(), isCurrentReadOnly(), content(), savedContent(),
    );

  const hasAnyUnsavedChanges = () =>
    hasUnsavedFileChanges() || header.hasUnsavedHeaderChanges();

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasAnyUnsavedChanges()) e.preventDefault();
  }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleBeforeUnload);
    onCleanup(() => window.removeEventListener("beforeunload", handleBeforeUnload));
  }

  async function loadContextContent(af: ActiveFile & { type: "context" }): Promise<void> {
    setFileViewMode("editor");
    try {
      const data = await getContext(props.projectSlug, header.savedFolderName(), af.name);
      if (data) {
        const normalized = normalizeLineEndings(data.content);
        setContent(normalized); setSavedContent(normalized);
      }
      else { setContent(""); setSavedContent(""); }
    } catch (e) {
      setContent(""); setSavedContent("");
      setError(e instanceof Error ? e.message : "Failed to load file");
    }
  }

  function loadFileByName(fileName: string, url: string): void {
    const mode = resolveFileViewMode(fileName);
    if (mode === "image") {
      setFileViewMode("image"); setImageUrl(url);
      setContent(""); setSavedContent("");
    } else if (mode === "editor") {
      setFileViewMode("editor");
      fetch(url).then(async (res) => {
        if (res.ok) {
          const text = normalizeLineEndings(await res.text());
          setContent(text); setSavedContent(text);
        } else { setContent(""); setSavedContent(""); }
      }).catch((e) => {
        setContent(""); setSavedContent("");
        setError(e instanceof Error ? e.message : "Failed to load file");
      });
    } else {
      setFileViewMode("unsupported"); setContent(""); setSavedContent("");
    }
  }

  createEffect(on(
    () => [props.projectSlug, props.ticket.folderName] as const,
    async ([projectSlug]) => {
      if (!projectSlug) return;
      try {
        const data = await getMergedLauncherConfig(projectSlug);
        setLauncherConfig(data);
        const defaults = data.columnDefaults[props.ticket.status];
        if (
          defaults?.lastLayer === "launcher"
          || defaults?.lastLayer === "shortcuts"
        ) setActiveTab(defaults.lastLayer);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load launcher config");
      } finally {
        setInitialTabResolved(true);
      }
    }
  ));

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    saveColumnDefaults(props.projectSlug, props.ticket.status, patch)
      .then((result) => {
        if (!result.ok) setError(result.message);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to save column defaults");
      });
  }

  createEffect(on(activeFile, async (af) => {
    if (activeTab() !== "editor") return;
    setError(""); setImageUrl("");
    if (af.type === "context") {
      await loadContextContent(af);
    } else if (af.type === "file") {
      loadFileByName(
        af.name,
        ticketUrl(`files/${encodeURIComponent(af.name)}`),
      );
    } else if (af.type === "reference") {
      loadFileByName(
        activeFileLabel(af),
        ticketUrl(
          `references/content?path=${encodeURIComponent(af.path)}`,
        ),
      );
    }
  }));

  async function saveFileContent() {
    const af = activeFile();
    if (af.type !== "context") return;
    setSaving(true);
    try {
      const result = await saveContextAction(
        props.projectSlug, header.savedFolderName(), af.name, content(),
      );
      if (result.ok) setSavedContent(content());
      else setError(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save file"); }
    finally { setSaving(false); }
  }

  async function saveFile() {
    await saveFileContent();
    revalidate("project-page");
  }

  function requestFileSwitch(file: ActiveFile) {
    if (isActiveFileMatch(file, activeFile()) && activeTab() === "editor") return;
    if (hasUnsavedFileChanges()) {
      setPendingFile(file); setConfirmingFileSwitch(true); return;
    }
    setActiveTab("editor");
    if (!isActiveFileMatch(file, activeFile())) setActiveFile(file);
  }

  function switchTab(tab: Tab) {
    if (tab === activeTab()) return;
    if (tab !== "editor") {
      if (hasUnsavedFileChanges()) {
        setPendingFile(null); setPendingTab(tab);
        setConfirmingFileSwitch(true); return;
      }
      setActiveTab(tab);
      if (tab === "launcher" || tab === "shortcuts") patchColumnDefaults({ lastLayer: tab });
    } else {
      setActiveTab("editor");
      patchColumnDefaults({ lastLayer: "editor" });
    }
  }

  function proceedFileSwitch() {
    const file = pendingFile(); const toTab = pendingTab();
    setConfirmingFileSwitch(false); setPendingFile(null); setPendingTab(null);
    if (toTab) {
      setActiveTab(toTab);
      if (toTab === "launcher" || toTab === "shortcuts") {
        patchColumnDefaults({ lastLayer: toTab });
      }
    }
    else if (file) { setActiveTab("editor"); setActiveFile(file); }
  }

  function selectFile(af: ActiveFile) { setDropdownOpen(false); requestFileSwitch(af); }

  function openNewFileDialog() { setDropdownOpen(false); setNewFileName(""); setNewFileDialogOpen(true); }

  function submitNewFile() {
    const raw = newFileName();
    const contextFileName = slugifyFileName(raw);
    if (!contextFileName) return;
    setNewFileDialogOpen(false);
    if (!contextOptions().some(
      (o) => o.type === "context" && o.name === contextFileName,
    )) setExtraFiles((prev) => [...prev, contextFileName]);
    requestFileSwitch({ type: "context", name: contextFileName });
  }

  async function deleteOrRemoveFile() {
    const af = activeFile();
    setConfirmingDelete(false);
    try {
      if (af.type === "reference") {
        const result = await removeReferenceAction(
          props.projectSlug, header.savedFolderName(), af.path,
        );
        if (!result.ok) { setError(result.message); return; }
        setTicketReferences((prev) => prev.filter((r) => r.path !== af.path));
      } else if (af.type === "file") {
        const result = await deleteFileAction(
          props.projectSlug, header.savedFolderName(), af.name,
        );
        if (!result.ok) { setError(result.message); return; }
        setTicketFileNames((prev) => prev.filter((n) => n !== af.name));
      } else {
        const result = await deleteContextAction(
          props.projectSlug, header.savedFolderName(), af.name,
        );
        if (!result.ok) { setError(result.message); return; }
        setExtraFiles((prev) => prev.filter((n) => n !== af.name));
      }
      revalidate("project-page");
      const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
      setActiveFile(remaining[0] ?? { type: "context", name: "to-do" });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
  }

  function handleTrashClick() {
    if (activeFile().type === "reference") deleteOrRemoveFile();
    else setConfirmingDelete(true);
  }

  function close() {
    if (hasAnyUnsavedChanges()) { setConfirmingClose(true); return; }
    props.onClose();
  }
  function forceClose() { setConfirmingClose(false); props.onClose(); }

  async function openNativeFileBrowser() {
    setBrowsing(true); setError("");
    try {
      const remembered = localStorage.getItem("picker:references:lastDir") ?? "";
      const refs = ticketReferences();
      const lastRef = refs[refs.length - 1]?.path;
      const fallback = lastRef ? lastRef.replace(/\/[^/]*$/, "") : "";
      const startDir = remembered || fallback;
      const paths = await openNativeFileBrowserServer(startDir || undefined);
      if (paths.length === 0) return;
      const lastPicked = paths[paths.length - 1];
      const pickedDir = lastPicked.replace(/\/[^/]*$/, "");
      if (pickedDir) localStorage.setItem("picker:references:lastDir", pickedDir);
      await handleReferencesSelected(paths);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to open file dialog"); }
    finally { setBrowsing(false); }
  }

  async function handleReferencesSelected(paths: string[]) {
    setError("");
    try {
      const result = await addReferencesAction(
        props.projectSlug, header.savedFolderName(), paths,
      );
      if (!result.ok) { setError(result.message); return; }
      const newRefs = paths.map((p) => ({ path: p, exists: true }));
      setTicketReferences((prev) => {
        const existing = new Set(prev.map((r) => r.path));
        return [...prev, ...newRefs.filter((r) => !existing.has(r.path))];
      });
      revalidate("project-page");
      if (paths.length > 0) requestFileSwitch({ type: "reference", path: paths[0] });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add references"); }
  }

  async function saveAll() {
    await Promise.all([
      header.hasUnsavedHeaderChanges() ? header.saveTicketHeader() : undefined,
      hasUnsavedFileChanges() ? saveFileContent() : undefined,
    ]);
    revalidate("project-page");
  }

  const showSaveButton = () => showSaveButtonPure(activeTab(), activeFile().type);

  return {
    activeFile, content, setContent, saving, confirmingClose, setConfirmingClose,
    confirmingFileSwitch, activeTab, initialTabResolved, launcherConfig,
    editedNumber: header.editedNumber, setEditedNumber: header.setEditedNumber,
    editedTitle: header.editedTitle, setEditedTitle: header.setEditedTitle,
    savedNumber: header.savedNumber, savedTitle: header.savedTitle,
    hasUnsavedHeaderChanges: header.hasUnsavedHeaderChanges,
    hasAnyUnsavedChanges, saveAll,
    newFileDialogOpen, setNewFileDialogOpen, newFileName, setNewFileName,
    confirmingDelete, setConfirmingDelete, error, dropdownOpen, setDropdownOpen,
    browsing, imageUrl, fileViewMode,
    uploading: upload.uploading, dragging: upload.dragging,
    confirmOverwrite: upload.confirmOverwrite, confirmSize: upload.confirmSize,
    runningShortcut: shortcuts.runningShortcut,
    dirtyWorktreeShortcut: shortcuts.dirtyWorktreeShortcut,
    setDirtyWorktreeShortcut: shortcuts.setDirtyWorktreeShortcut,
    useWorktree, allFileOptions, isReferenceStale, hasUnsavedFileChanges, isCurrentReadOnly,
    showSaveButton, persistWorktree, runShortcut: shortcuts.runShortcut,
    switchTab, selectFile, openNewFileDialog,
    submitNewFile, deleteOrRemoveFile, handleTrashClick, close, forceClose,
    proceedFileSwitch,
    cancelFileSwitch: () => {
      setConfirmingFileSwitch(false); setPendingFile(null); setPendingTab(null);
    },
    handleDragOver: upload.handleDragOver, handleDragLeave: upload.handleDragLeave,
    handleDrop: upload.handleDrop, handleFileInputChange: upload.handleFileInputChange,
    confirmSizeAndUpload: upload.confirmSizeAndUpload,
    confirmOverwriteAndUpload: upload.confirmOverwriteAndUpload,
    openNativeFileBrowser,
    cancelSizeConfirm: upload.cancelSizeConfirm,
    cancelOverwriteConfirm: upload.cancelOverwriteConfirm,
    saveFile, patchColumnDefaults,
  };
}

export type TicketDetailState = ReturnType<typeof createTicketDetailState>;
