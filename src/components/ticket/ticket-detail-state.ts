import { createSignal, createEffect, createMemo, on, onCleanup } from "solid-js";
import { revalidate, query } from "@solidjs/router";
import { createNonSuspendingAsync } from "~/lib/create-non-suspending-async.js";
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
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { computeLaunchDir } from "../launcher/agent-launcher-pure.js";
import {
  getContext, getTicketFiles, saveContext as saveContextAction,
  deleteContext as deleteContextAction, deleteFile as deleteFileAction,
  removeReference as removeReferenceAction, setUseWorktree as setUseWorktreeAction,
  addReferences as addReferencesAction, openTicketWorktree,
  ticketMutationRevalidateKeys,
} from "./ticket-api.js";
import {
  getMergedLauncherConfig, saveColumnDefaults,
  type MergedLauncherConfigWithMeta,
} from "../launcher/launcher-api.js";
import { openNativeFileBrowser as openNativeFileBrowserServer } from "../shared/shared-api.js";

export type Tab = "editor" | "launcher";

function peekCachedLauncherConfig(projectSlug: string): MergedLauncherConfigWithMeta | undefined {
  try {
    return query.get(getMergedLauncherConfig.keyFor(projectSlug)) as MergedLauncherConfigWithMeta | undefined;
  } catch {
    return undefined;
  }
}

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
  const [launcherConfig, setLauncherConfig] = createSignal<MergedLauncherConfigWithMeta | null>(null);
  const [extraFiles, setExtraFiles] = createSignal<string[]>([]);
  const [newFileDialogOpen, setNewFileDialogOpen] = createSignal(false);
  const [newFileName, setNewFileName] = createSignal("");
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [error, setError] = createSignal<ErrorInfo | null>(null);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [browsing, setBrowsing] = createSignal(false);
  const [imageUrl, setImageUrl] = createSignal("");
  const [fileViewMode, setFileViewMode] = createSignal<"editor" | "image" | "unsupported">("editor");
  const [contentLoading, setContentLoading] = createSignal(true);
  const [useWorktree, setUseWorktree] = createSignal(props.ticket.useWorktree);

  const header = createHeaderEditState({
    projectSlug: props.projectSlug,
    ticket: props.ticket,
    setError,
  });

  const ticketFiles = createNonSuspendingAsync(
    () => getTicketFiles(props.projectSlug, header.savedFolderName()),
    {
      initialValue: {
        contextNames: props.ticket.contextNames ?? [],
        fileNames: props.ticket.fileNames ?? [],
        references: props.ticket.references ?? [],
      },
    },
  );

  async function refreshTicketFiles() {
    await revalidate(["ticket-files", ...ticketMutationRevalidateKeys]);
  }

  function ticketUrl(suffix: string): string {
    return ticketApiUrl(props.projectSlug, header.savedFolderName(), suffix);
  }

  const launchDir = createMemo(() => computeLaunchDir({
    useWorktree: useWorktree(),
    projectPath: launcherConfig()?.projectPath ?? "",
    worktreeRootPath: launcherConfig()?.worktreeRootPath ?? null,
    agentWorktreeDir: launcherConfig()?.agentWorktreeDir ?? "",
    folderName: header.savedFolderName(),
    savedAgentWorktreeDir: props.ticket.agentWorktreeDir,
  }));

  const shortcuts = createShortcutState({
    projectSlug: () => props.projectSlug,
    folderName: header.savedFolderName,
    useWorktree,
    launchDir,
    setError,
  });

  const upload = createFileUploadState({
    projectSlug: props.projectSlug,
    folderName: header.savedFolderName,
    setError,
    ticketFileNames: () => ticketFiles().fileNames,
    contextNames: () => ticketFiles().contextNames,
    refreshFiles: refreshTicketFiles,
    requestFileSwitch,
  });

  createEffect(on(
    () => props.ticket.folderName,
    () => setUseWorktree(props.ticket.useWorktree),
  ));

  async function openWorktree() {
    setError(null);
    try {
      const result = await openTicketWorktree(props.projectSlug, header.savedFolderName());
      if (!result.ok) setError(result.errorInfo);
    } catch (e) {
      setError(errorPayload(e, "Open failed"));
    }
  }

  function persistWorktree(value: boolean) {
    setUseWorktree(value);
    setUseWorktreeAction(props.projectSlug, header.savedFolderName(), value)
      .then((result) => {
        if (!result.ok) setError({ title: "Save failed", description: result.message });
      })
      .catch((err) => {
        setError(errorPayload(err, "Save failed"));
      });
  }

  const contextOptions = (): ActiveFile[] =>
    buildContextOptions(
      ["to-do", "product-requirement-document"],
      ticketFiles().contextNames,
      extraFiles(),
    );

  const fileEntryOptions = (): ActiveFile[] =>
    buildFileEntryOptions(ticketFiles().fileNames);

  const referenceOptions = (): ActiveFile[] =>
    buildReferenceOptions(ticketFiles().references);

  const allFileOptions = createMemo(() =>
    buildAllFileOptions(contextOptions(), fileEntryOptions(), referenceOptions()));

  function isCurrentReadOnly(): boolean {
    return isReadOnly(activeFile());
  }

  function isReferenceStale(refPath: string): boolean {
    return checkReferenceStale(ticketFiles().references, refPath);
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
    setContentLoading(true);
    try {
      const data = await getContext(props.projectSlug, header.savedFolderName(), af.name);
      if (data) {
        const normalized = normalizeLineEndings(data.content);
        setContent(normalized); setSavedContent(normalized);
      }
      else { setContent(""); setSavedContent(""); }
    } catch (e) {
      setContent(""); setSavedContent("");
      setError(errorPayload(e, "Load failed"));
    } finally {
      setContentLoading(false);
    }
  }

  function loadFileByName(fileName: string, url: string): void {
    const mode = resolveFileViewMode(fileName);
    if (mode === "image") {
      setFileViewMode("image"); setImageUrl(url);
      setContent(""); setSavedContent("");
      setContentLoading(false);
    } else if (mode === "editor") {
      setFileViewMode("editor");
      setContentLoading(true);
      fetch(url).then(async (res) => {
        if (res.ok) {
          const text = normalizeLineEndings(await res.text());
          setContent(text); setSavedContent(text);
        } else { setContent(""); setSavedContent(""); }
      }).catch((e) => {
        setContent(""); setSavedContent("");
        setError(errorPayload(e, "Load failed"));
      }).finally(() => {
        setContentLoading(false);
      });
    } else {
      setFileViewMode("unsupported"); setContent(""); setSavedContent("");
      setContentLoading(false);
    }
  }

  function applyInitialTab(data: MergedLauncherConfigWithMeta) {
    setLauncherConfig(data);
    const defaults = data.columnDefaults[props.ticket.status];
    if (defaults?.lastLayer === "launcher") setActiveTab("launcher");
    setInitialTabResolved(true);
  }

  const cachedConfig = peekCachedLauncherConfig(props.projectSlug);
  if (cachedConfig) applyInitialTab(cachedConfig);

  createEffect(on(
    () => [props.projectSlug, props.ticket.folderName] as const,
    async ([projectSlug]) => {
      if (!projectSlug || initialTabResolved()) return;
      try {
        applyInitialTab(await getMergedLauncherConfig(projectSlug));
      } catch (e) {
        setError(errorPayload(e, "Load failed"));
        setInitialTabResolved(true);
      }
    }
  ));

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    saveColumnDefaults(props.projectSlug, props.ticket.status, patch)
      .then((result) => {
        if (!result.ok) setError({ title: "Save failed", description: result.message });
      })
      .catch((e) => {
        setError(errorPayload(e, "Save failed"));
      });
  }

  void loadContextContent({ type: "context", name: "to-do" });

  createEffect(on(activeFile, async (af) => {
    if (activeTab() !== "editor") return;
    setError(null); setImageUrl("");
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
  }, { defer: true }));

  async function saveFileContent() {
    const af = activeFile();
    if (af.type !== "context") return;
    setSaving(true);
    try {
      const result = await saveContextAction(
        props.projectSlug, header.savedFolderName(), af.name, content(),
      );
      if (result.ok) setSavedContent(content());
      else setError({ title: "Save failed", description: result.message });
    } catch (e) { setError(errorPayload(e, "Save failed")); }
    finally { setSaving(false); }
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
      patchColumnDefaults({ lastLayer: tab });
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
      patchColumnDefaults({ lastLayer: toTab });
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
        if (!result.ok) { setError({ title: "Delete failed", description: result.message }); return; }
      } else if (af.type === "file") {
        const result = await deleteFileAction(
          props.projectSlug, header.savedFolderName(), af.name,
        );
        if (!result.ok) { setError({ title: "Delete failed", description: result.message }); return; }
      } else {
        const result = await deleteContextAction(
          props.projectSlug, header.savedFolderName(), af.name,
        );
        if (!result.ok) { setError({ title: "Delete failed", description: result.message }); return; }
        setExtraFiles((prev) => prev.filter((n) => n !== af.name));
      }
      const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
      setActiveFile(remaining[0] ?? { type: "context", name: "to-do" });
      await refreshTicketFiles();
    } catch (e) { setError(errorPayload(e, "Delete failed")); }
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
    setBrowsing(true); setError(null);
    try {
      const remembered = localStorage.getItem("picker:references:lastDir") ?? "";
      const refs = ticketFiles().references;
      const lastRef = refs[refs.length - 1]?.path;
      const fallback = lastRef ? lastRef.replace(/\/[^/]*$/, "") : "";
      const startDir = remembered || fallback;
      const paths = await openNativeFileBrowserServer(startDir || undefined);
      if (paths.length === 0) return;
      const lastPicked = paths[paths.length - 1];
      const pickedDir = lastPicked.replace(/\/[^/]*$/, "");
      if (pickedDir) localStorage.setItem("picker:references:lastDir", pickedDir);
      await handleReferencesSelected(paths);
    } catch (e) { setError(errorPayload(e, "Browse failed")); }
    finally { setBrowsing(false); }
  }

  async function handleReferencesSelected(paths: string[]) {
    setError(null);
    try {
      const result = await addReferencesAction(
        props.projectSlug, header.savedFolderName(), paths,
      );
      if (!result.ok) { setError({ title: "Add reference failed", description: result.message }); return; }
      await refreshTicketFiles();
      if (paths.length > 0) requestFileSwitch({ type: "reference", path: paths[0] });
    } catch (e) { setError(errorPayload(e, "Add reference failed")); }
  }

  async function saveAll() {
    await Promise.all([
      header.hasUnsavedHeaderChanges() ? header.saveTicketHeader() : undefined,
      hasUnsavedFileChanges() ? saveFileContent() : undefined,
    ]);
    await refreshTicketFiles();
  }

  const showSaveButton = () => showSaveButtonPure(activeTab(), activeFile().type);

  return {
    activeFile, content, setContent, saving, confirmingClose, setConfirmingClose,
    confirmingFileSwitch, activeTab, initialTabResolved, launcherConfig,
    editedNumber: header.editedNumber, setEditedNumber: header.setEditedNumber,
    editedTitle: header.editedTitle, setEditedTitle: header.setEditedTitle,
    savedNumber: header.savedNumber, savedTitle: header.savedTitle,
    savedFolderName: header.savedFolderName,
    hasUnsavedHeaderChanges: header.hasUnsavedHeaderChanges,
    hasAnyUnsavedChanges, saveAll,
    newFileDialogOpen, setNewFileDialogOpen, newFileName, setNewFileName,
    confirmingDelete, setConfirmingDelete, error, setError, dropdownOpen, setDropdownOpen,
    browsing, imageUrl, fileViewMode, contentLoading,
    uploading: upload.uploading, dragging: upload.dragging,
    confirmOverwrite: upload.confirmOverwrite, confirmSize: upload.confirmSize,
    runningShortcut: shortcuts.runningShortcut,
    shortcutConfirmation: shortcuts.shortcutConfirmation,
    setShortcutConfirmation: shortcuts.setShortcutConfirmation,
    runShortcut: shortcuts.runShortcut,
    useWorktree, launchDir, allFileOptions, isReferenceStale, hasUnsavedFileChanges, isCurrentReadOnly,
    showSaveButton, persistWorktree, openWorktree,
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
    patchColumnDefaults,
  };
}

export type TicketDetailState = ReturnType<typeof createTicketDetailState>;
