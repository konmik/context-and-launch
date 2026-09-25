import { createSignal, createEffect, createMemo, flush, onSettled, untrack, useContext } from "solid-js";
import { LauncherConfigContext } from '../launcher/shared-launcher-config-storage.js';
import { mergeLauncherConfigs, type LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import type { StoredSignal } from '~/util/stored-signal.js';
import { ProjectLauncherConfigContext } from '../launcher/project-launcher-config-storage.js';
import type { Accessor } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { LauncherColumnDefaults } from "~/core/launcher/launcher-config-data.js";
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
import { TicketStatusContext } from './ticket-status-storage.js';
import { createShortcutState } from "./ticket-detail-shortcuts.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { computeLaunchDir } from "../launcher/agent-launcher-pure.js";
import {
  getContext as getContextAction, saveContext as saveContextAction,
  deleteContext as deleteContextAction, deleteFile as deleteFileAction,
  openTicketWorktree, uploadFile as uploadFileAction,
} from "./ticket-api.js";
import { ticketMutationRevalidateKeys } from "../shared/revalidate-keys.js";
import { createWorktreeRevision } from "../shared/worktree-revision.js";
import {
  getProjectLauncherMetadata,
  runShortcut,
} from "../launcher/launcher-api.js";
import { openNativeFileBrowser as openNativeFileBrowserServer } from "../shared/shared-api.js";

export type Tab = "editor" | "launcher";

export interface TicketDetailStateDeps {
  sharedConfig?: StoredSignal<LauncherConfig>;
  ticketStatus?: StoredSignal<TicketInfo>;
  worktreeRevision?: Accessor<number>;
  getContext?: typeof getContextAction;
  saveContext?: typeof saveContextAction;
  deleteContext?: typeof deleteContextAction;
  deleteFile?: typeof deleteFileAction;
  openTicketWorktree?: typeof openTicketWorktree;
  uploadFile?: typeof uploadFileAction;
  runShortcut?: typeof runShortcut;
  projectConfig?: StoredSignal<LauncherConfig>;
  getProjectLauncherMetadata?: (projectSlug: string) => ReturnType<typeof getProjectLauncherMetadata>;
  openNativeFileBrowser?: typeof openNativeFileBrowserServer;
}

export function createTicketDetailState(
  props: { projectSlug: string; onClose: () => void },
  deps: TicketDetailStateDeps = {},
) {
  const [activeFile, setActiveFile] = createSignal<ActiveFile>({ type: "context", name: "description" });
  const [content, setContent] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<ActiveFile | null>(null);
  const [confirmingFileSwitch, setConfirmingFileSwitch] = createSignal(false);
  const [pendingTab, setPendingTab] = createSignal<Tab | null>(null);
  const [activeTab, setActiveTab] = createSignal<Tab>("editor");
  const [initialTabResolved, setInitialTabResolved] = createSignal(false);
  const sharedConfig = deps.sharedConfig ?? useContext(LauncherConfigContext)!;
  const projectConfig = deps.projectConfig ?? useContext(ProjectLauncherConfigContext)!;
  const metadata = createMemo(() =>
    (deps.getProjectLauncherMetadata ?? getProjectLauncherMetadata)(props.projectSlug), { loadingValue: null });
  const launcherConfig = createMemo(() => {
    const project = metadata();
    return project && { ...project, ...mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()) };
  });
  const [extraFiles, setExtraFiles] = createSignal<string[]>([]);
  const [newFileDialogOpen, setNewFileDialogOpen] = createSignal(false);
  const [newFileName, setNewFileName] = createSignal("");
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [error, setError] = createSignal<ErrorInfo | null>(null);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [browsing, setBrowsing] = createSignal(false);
  const [fileView, setFileView] = createSignal<FileView>({ kind: "loading" });
  const ticketStatus = deps.ticketStatus ?? useContext(TicketStatusContext)!;
  const ticket = ticketStatus.get;
  const folderName = () => ticket().folderName;
  const useWorktree = () => ticket().useWorktree;
  const [externallyChanged, setExternallyChanged] = createSignal(false);
  const [confirmingExternalChange, setConfirmingExternalChange] = createSignal(false);

  const worktreeRevision = deps.worktreeRevision ?? createWorktreeRevision(() => props.projectSlug);

  const [editedNumber, setEditedNumber] = createSignal(() => ticket().number);
  const [editedTitle, setEditedTitle] = createSignal(() => ticket().title);
  const hasUnsavedHeaderChanges = () =>
    editedNumber().trim() !== ticket().number || editedTitle().trim() !== ticket().title;

  async function saveTicketHeader() {
    const number = editedNumber().trim() || ticket().number;
    const title = editedTitle().trim() || ticket().title;
    setEditedNumber(number);
    setEditedTitle(title);
    if (number === ticket().number && title === ticket().title) return;
    const result = await ticketStatus.update(current => ({ ...current, number, title }));
    if (result.type === 'Failure') setError({ title: "Save failed", description: result.error });
  }

  async function refreshTicket() {
    await revalidate(["ticket-detail", ...ticketMutationRevalidateKeys]);
    const result = await ticketStatus.refresh();
    if (result.type === 'Failure') setError({ title: "Load failed", description: result.error });
  }

  function ticketUrl(suffix: string): string {
    return ticketApiUrl(props.projectSlug, folderName(), suffix);
  }

  const launchDir = createMemo(() => computeLaunchDir({
    useWorktree: useWorktree(),
    projectPath: launcherConfig()?.projectPath ?? "",
    worktreeRootPath: launcherConfig()?.worktreeRootPath ?? null,
    agentWorktreeDir: launcherConfig()?.agentWorktreeDir ?? "",
    folderName: folderName(),
    savedAgentWorktreeDir: ticket().agentWorktreeDir,
  }));

  const shortcuts = createShortcutState({
    projectSlug: () => props.projectSlug,
    folderName,
    useWorktree,
    launchDir,
    setError,
    runShortcut: deps.runShortcut,
  });

  const upload = createFileUploadState({
    projectSlug: props.projectSlug,
    folderName,
    setError,
    ticketFileNames: () => ticket().fileNames,
    contextNames: () => ticket().contextNames,
    refreshFiles: refreshTicket,
    requestFileSwitch,
    uploadFile: deps.uploadFile,
  });

  async function openWorktree() {
    setError(null);
    try {
      const result = await (deps.openTicketWorktree ?? openTicketWorktree)(
        props.projectSlug, folderName(),
      );
      if (!result.ok) setError(result.errorInfo);
    } catch (e) {
      setError(errorPayload(e, "Open failed"));
    }
  }

  const contextOptions = (): ActiveFile[] =>
    buildContextOptions(
      ["description", "product-requirement-document"],
      ticket().contextNames,
      extraFiles(),
    );

  const fileEntryOptions = (): ActiveFile[] =>
    buildFileEntryOptions(ticket().fileNames);

  const referenceOptions = (): ActiveFile[] =>
    buildReferenceOptions(ticket().references);

  const allFileOptions = createMemo(() =>
    buildAllFileOptions(contextOptions(), fileEntryOptions(), referenceOptions()));

  function isCurrentReadOnly(): boolean {
    return isReadOnly(activeFile());
  }

  function isReferenceStale(refPath: string): boolean {
    return checkReferenceStale(ticket().references, refPath);
  }

  const hasUnsavedFileChanges = () =>
    hasUnsavedEditorChanges(
      activeTab(), fileView().kind, isCurrentReadOnly(), content(), savedContent(),
    );

  const hasAnyUnsavedChanges = () =>
    hasUnsavedFileChanges() || hasUnsavedHeaderChanges();

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasAnyUnsavedChanges()) e.preventDefault();
  }
  onSettled(() => {
    const browserWindow = globalThis.window;
    if (!browserWindow) return;
    browserWindow.addEventListener("beforeunload", handleBeforeUnload);
    return () => browserWindow.removeEventListener("beforeunload", handleBeforeUnload);
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
      const data = await (deps.getContext ?? getContextAction)(
        props.projectSlug, folderName(), af.name,
      );
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

  createEffect(
    () => [projectConfig.get(), ticket().status, initialTabResolved()] as const,
    ([data, status, resolved]) => {
      if (!data || resolved) return;
      if (data.columnDefaults?.[status]?.lastLayer === 'launcher') setActiveTab('launcher');
      setInitialTabResolved(true);
    },
  );

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    const column = ticket().status;
    projectConfig.update(current => ({
      ...current,
      columnDefaults: {
        ...current.columnDefaults,
        [column]: {
          templateName: null, checkedSkills: [], profileName: null,
          ...(current.columnDefaults && Object.hasOwn(current.columnDefaults, column)
            && current.columnDefaults[column]),
          ...patch,
        },
      },
    }))
      .then((result) => {
        if (result.type === 'Failure') { setError({ title: "Save failed", description: result.error }); return; }
      })
      .catch((e) => {
        setError(errorPayload(e, "Save failed"));
      });
  }

  onSettled(() => {
    void loadContextContent({ type: "context", name: "description" });
  });

  function fileContentUrl(af: ActiveFile & { type: "file" | "reference" }): string {
    return af.type === "file"
      ? ticketUrl(`files/${encodeURIComponent(af.name)}`)
      : ticketUrl(`references/content?path=${encodeURIComponent(af.path)}`);
  }

  async function readFileText(af: ActiveFile): Promise<string> {
    if (af.type === "context") {
      const data = await (deps.getContext ?? getContextAction)(
        props.projectSlug, folderName(), af.name,
      );
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
    void refreshTicket();
    if (tab !== "editor") return;
    if (hasUnsavedChanges) { void untrack(() => detectExternalChange(af)); return; }
    void untrack(() => loadActiveFile(af, true));
  }, { defer: true });

  async function saveFileContent() {
    const af = activeFile();
    if (af.type !== "context") return;
    setSaving(true);
    try {
      const result = await (deps.saveContext ?? saveContextAction)(
        props.projectSlug, folderName(), af.name, content(),
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
        const result = await ticketStatus.update(current => ({
          ...current, references: current.references.filter(reference => reference.path !== af.path),
        }));
        if (result.type === 'Failure') { setError({ title: "Delete failed", description: result.error }); return; }
      } else if (af.type === "file") {
        const result = await (deps.deleteFile ?? deleteFileAction)(
          props.projectSlug, folderName(), af.name,
        );
        if (!result.ok) { setError({ title: "Delete failed", description: result.message }); return; }
      } else {
        const result = await (deps.deleteContext ?? deleteContextAction)(
          props.projectSlug, folderName(), af.name,
        );
        if (!result.ok) { setError({ title: "Delete failed", description: result.message }); return; }
        setExtraFiles((prev) => prev.filter((n) => n !== af.name));
      }
      const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af));
      setActiveFile(remaining[0] ?? { type: "context", name: "description" });
      await refreshTicket();
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
      const refs = ticket().references;
      const lastRef = refs[refs.length - 1]?.path;
      const fallback = lastRef ? lastRef.replace(/\/[^/]*$/, "") : "";
      const startDir = remembered || fallback;
      const paths = await (deps.openNativeFileBrowser ?? openNativeFileBrowserServer)(startDir || null);
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
      const result = await ticketStatus.update(current => ({
        ...current, references: [...new Set([...current.references.map(reference => reference.path), ...paths])]
          .map(path => ({ path, exists: true })),
      }));
      if (result.type === 'Failure') { setError({ title: "Add reference failed", description: result.error }); return; }
      // Show the reference the user just picked before reloading the file list:
      // the switch is what they asked for, and it must not wait on a refresh.
      if (paths.length > 0) requestFileSwitch({ type: "reference", path: paths[0] });
      await refreshTicket();
    } catch (e) { setError(errorPayload(e, "Add reference failed")); }
  }

  async function saveAll() {
    if (externallyChanged() && hasUnsavedFileChanges()) {
      setConfirmingExternalChange(true);
      return;
    }
    if (hasUnsavedHeaderChanges()) await saveTicketHeader();
    if (hasUnsavedFileChanges()) await saveFileContent();
    await refreshTicket();
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
    editedNumber, setEditedNumber, editedTitle, setEditedTitle, hasUnsavedHeaderChanges,
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
    launchDir, allFileOptions, isReferenceStale, hasUnsavedFileChanges, isCurrentReadOnly,
    showSaveButton, openWorktree,
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
