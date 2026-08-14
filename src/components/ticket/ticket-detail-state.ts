import { createSignal, createEffect, createMemo, flush, onSettled, untrack } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/core/launcher/launcher-config.js";
import {
  type ActiveFile,
  type FileView,
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
} from "./ticket-api.js";
import { ticketMutationRevalidateKeys } from "../shared/revalidate-keys.js";
import { createWorktreeRevision } from "../shared/worktree-revision.js";
import {
  latestMergedLauncherConfig, loadMergedLauncherConfig, saveColumnDefaultsAndReturnConfig,
  type MergedLauncherConfigWithMeta,
} from "../launcher/launcher-api.js";
import { openNativeFileBrowser as openNativeFileBrowserServer } from "../shared/shared-api.js";

export type Tab = "editor" | "launcher";

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
  const [fileView, setFileView] = createSignal<FileView>({ kind: "loading" });
  const [useWorktree, setUseWorktree] = createSignal(() => props.ticket.useWorktree);
  const [externallyChanged, setExternallyChanged] = createSignal(false);
  const [confirmingExternalChange, setConfirmingExternalChange] = createSignal(false);

  const worktreeRevision = createWorktreeRevision(() => props.projectSlug);

  const header = createHeaderEditState({
    projectSlug: props.projectSlug,
    ticket: props.ticket,
    setError,
  });

  const ticketFiles = createMemo(
    () => getTicketFiles(props.projectSlug, header.savedFolderName()),
    {
      loadingValue: {
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

  const cachedConfig = latestMergedLauncherConfig(props.projectSlug);

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
      activeTab(), fileView().kind, isCurrentReadOnly(), content(), savedContent(),
    );

  const hasAnyUnsavedChanges = () =>
    hasUnsavedFileChanges() || header.hasUnsavedHeaderChanges();

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasAnyUnsavedChanges()) e.preventDefault();
  }
  onSettled(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  // Only the newest load may touch the view state: a slow response for a file
  // the user has already navigated away from must not clobber the current view
  // or content.
  let loadSeq = 0;

  async function loadContextContent(
    af: ActiveFile & { type: "context" }, background = false,
  ): Promise<void> {
    const seq = ++loadSeq;
    if (!background) setFileView({ kind: "loading" });
    try {
      const data = await getContext(props.projectSlug, header.savedFolderName(), af.name);
      if (seq !== loadSeq) return;
      const normalized = data ? normalizeLineEndings(data.content) : "";
      setContent(normalized); setSavedContent(normalized);
    } catch (e) {
      if (seq !== loadSeq) return;
      setContent(""); setSavedContent("");
      setError(errorPayload(e, "Load failed"));
    } finally {
      if (seq === loadSeq) setFileView({ kind: "editor" });
    }
  }

  function loadFileByName(fileName: string, url: string, background = false): void {
    const seq = ++loadSeq;
    const mode = resolveFileViewMode(fileName);
    if (!background) { setContent(""); setSavedContent(""); }
    if (mode === "image") {
      setFileView({ kind: "image", url });
    } else if (mode === "editor") {
      if (!background) setFileView({ kind: "loading" });
      fetch(url).then(async (res) => {
        const text = res.ok ? normalizeLineEndings(await res.text()) : "";
        if (seq !== loadSeq) return;
        setContent(text); setSavedContent(text);
      }).catch((e) => {
        if (seq !== loadSeq) return;
        setError(errorPayload(e, "Load failed"));
      }).finally(() => {
        if (seq === loadSeq) setFileView({ kind: "editor" });
      });
    } else {
      setFileView({ kind: "unsupported" });
    }
  }

  function applyInitialTab(data: MergedLauncherConfigWithMeta, status = props.ticket.status) {
    setLauncherConfig(data);
    const defaults = data.columnDefaults[status];
    if (defaults?.lastLayer === "launcher") setActiveTab("launcher");
    setInitialTabResolved(true);
  }

  createEffect(
    () => [
      props.projectSlug,
      props.ticket.folderName,
      props.ticket.status,
      initialTabResolved(),
    ] as const,
    ([projectSlug, , status, resolved]) => { void (async () => {
      if (!projectSlug || resolved) return;
      try {
        applyInitialTab(await loadMergedLauncherConfig(projectSlug), status);
      } catch (e) {
        setError(errorPayload(e, "Load failed"));
        setInitialTabResolved(true);
      }
    })(); }
  );

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    saveColumnDefaultsAndReturnConfig(props.projectSlug, props.ticket.status, patch)
      .then((result) => {
        if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
        setLauncherConfig(result.config);
      })
      .catch((e) => {
        setError(errorPayload(e, "Save failed"));
      });
  }

  onSettled(() => {
    if (cachedConfig) applyInitialTab(cachedConfig);
    void loadContextContent({ type: "context", name: "to-do" });
  });

  function fileContentUrl(af: ActiveFile & { type: "file" | "reference" }): string {
    return af.type === "file"
      ? ticketUrl(`files/${encodeURIComponent(af.name)}`)
      : ticketUrl(`references/content?path=${encodeURIComponent(af.path)}`);
  }

  async function readFileText(af: ActiveFile): Promise<string> {
    if (af.type === "context") {
      const data = await getContext(props.projectSlug, header.savedFolderName(), af.name);
      return data ? normalizeLineEndings(data.content) : "";
    }
    const response = await fetch(fileContentUrl(af));
    return response.ok ? normalizeLineEndings(await response.text()) : "";
  }

  async function loadActiveFile(af: ActiveFile, background = false): Promise<void> {
    setExternallyChanged(false);
    if (af.type === "context") {
      await loadContextContent(af, background);
    } else {
      loadFileByName(activeFileLabel(af), fileContentUrl(af), background);
    }
  }

  /**
   * The worktree revision covers every Ticket in the Project, so it answers
   * "something was written" and never "this file was written". Only the file
   * being edited decides a conflict, and only by its content: a revision bump
   * whose disk content still matches what the editor loaded is not one.
   */
  async function detectExternalChange(af: ActiveFile): Promise<void> {
    try {
      const text = await readFileText(af);
      if (!isActiveFileMatch(af, activeFile()) || !hasUnsavedFileChanges()) return;
      if (text === savedContent()) return;
      setExternallyChanged(true);
    } catch (e) {
      setError(errorPayload(e, "Load failed"));
    }
  }

	createEffect(() => {
		const af = activeFile();
		return [af, untrack(activeTab)] as const;
	}, ([af, tab]) => { void (async () => {
    if (tab !== "editor") return;
    setError(null);
		await untrack(() => loadActiveFile(af));
	})(); }, { defer: true });

  createEffect(
    () => {
      const revision = worktreeRevision();
      return untrack(() => [
        revision,
        activeTab(),
        hasUnsavedFileChanges(),
        activeFile(),
      ] as const);
    },
    ([, tab, hasUnsavedChanges, af]) => {
    void revalidate("ticket-files");
    if (tab !== "editor") return;
    if (hasUnsavedChanges) { void untrack(() => detectExternalChange(af)); return; }
    void untrack(() => loadActiveFile(af, true));
  }, { defer: true });

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
      const paths = await openNativeFileBrowserServer(startDir || null);
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
    if (externallyChanged() && hasUnsavedFileChanges()) {
      setConfirmingExternalChange(true);
      return;
    }
    await Promise.all([
      header.hasUnsavedHeaderChanges() ? header.saveTicketHeader() : undefined,
      hasUnsavedFileChanges() ? saveFileContent() : undefined,
    ]);
    await refreshTicketFiles();
  }

  async function overwriteExternalChange() {
    setConfirmingExternalChange(false);
    setExternallyChanged(false);
    // saveAll must observe the user's explicit overwrite choice in this event turn.
    flush();
    await saveAll();
  }

  function discardExternalChange() {
    setConfirmingExternalChange(false);
    void loadActiveFile(activeFile());
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
    browsing, fileView,
    uploading: upload.uploading, dragging: upload.dragging,
    confirmOverwrite: upload.confirmOverwrite, confirmSize: upload.confirmSize,
    runningShortcut: shortcuts.runningShortcut,
    shortcutConfirmation: shortcuts.shortcutConfirmation,
    setShortcutConfirmation: shortcuts.setShortcutConfirmation,
    runShortcut: shortcuts.runShortcut,
    useWorktree, launchDir, allFileOptions, isReferenceStale, hasUnsavedFileChanges, isCurrentReadOnly,
    showSaveButton, persistWorktree, openWorktree,
    externallyChanged, confirmingExternalChange,
    overwriteExternalChange, discardExternalChange,
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
