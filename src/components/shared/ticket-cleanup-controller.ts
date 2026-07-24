import { createSignal } from "solid-js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import type { CleanupItemKey, TicketCleanupStatus } from "~/core/worktree/ticket-cleanup-checks.js";
import type { LockingProcessInfo } from "~/core/worktree/agent-worktree.js";
import {
  type TicketCleanupOptions, type TicketCleanupItemStates,
  singleCleanupOption, toErrorInfo, allChecking, allError,
} from "./ticket-cleanup-pure.js";

export interface TicketCleanupDeps {
  projectSlug: () => string;
  ticket: () => TicketInfo | null;
  action: () => "archive" | "delete";
  loadStatus: (projectSlug: string, folderName: string) => Promise<TicketCleanupStatus>;
  onCleanup: (
    folderName: string, cleanup: TicketCleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  onSubmit: (folderName: string) => Promise<{ error?: string | ErrorInfo }>;
  onOpenChange: (open: boolean) => void;
  loadLockingProcesses: (projectSlug: string, folderName: string) => Promise<LockingProcessInfo[]>;
  killLockingProcesses: (projectSlug: string, folderName: string, pids: number[]) => Promise<{ error?: string }>;
  forceDeleteLocalBranch: (projectSlug: string, folderName: string) => Promise<{ error?: string }>;
}

export function createTicketCleanupController(deps: TicketCleanupDeps) {
  const [items, setItems] = createSignal<TicketCleanupItemStates>(allChecking());
  const [runningItem, setRunningItem] = createSignal<CleanupItemKey>();
  const [submitting, setSubmitting] = createSignal(false);
  const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
  const [killDialogOpen, setKillDialogOpen] = createSignal(false);
  const [lockingProcesses, setLockingProcesses] = createSignal<LockingProcessInfo[] | undefined>();
  const [killingProcesses, setKillingProcesses] = createSignal(false);
  const [forceDeleteDialogOpen, setForceDeleteDialogOpen] = createSignal(false);
  const [forceDeleting, setForceDeleting] = createSignal(false);

  let requestToken = 0;
  let lifecycleToken = 0;

  async function startChecks(): Promise<void> {
    const ticket = deps.ticket();
    if (!ticket) return;
    const token = ++requestToken;
    setErrorInfo(null);
    setItems(allChecking());
    try {
      const status = await deps.loadStatus(deps.projectSlug(), ticket.folderName);
      if (token === requestToken) {
        setItems(status);
      }
    } catch (err: any) {
      if (token === requestToken) {
        setItems(allError(toErrorInfo(err?.message ?? "Failed to check cleanup status")));
      }
    }
  }

  async function runCleanup(key: CleanupItemKey): Promise<void> {
    const ticket = deps.ticket();
    if (!ticket || busy() || items()[key].state !== "ready") return;
    const token = lifecycleToken;
    setRunningItem(key);
    setErrorInfo(null);
    let actionError: ErrorInfo | undefined;
    try {
      const result = await deps.onCleanup(ticket.folderName, singleCleanupOption(key));
      if (result.error) actionError = toErrorInfo(result.error);
    } catch (err: any) {
      actionError = {
        title: "Cleanup failed",
        description: err?.message ?? "Unknown error",
      };
    }
    if (token !== lifecycleToken) return;
    await startChecks();
    if (token !== lifecycleToken) return;
    if (actionError) setErrorInfo(actionError);
    setRunningItem(undefined);
  }

  const actionLabel = () => deps.action() === "archive" ? "Archive" : "Delete";
  const busy = () => submitting() || runningItem() !== undefined || killingProcesses() || forceDeleting();

  async function doSubmit() {
    const ticket = deps.ticket();
    if (!ticket || busy()) return;
    setSubmitting(true);
    setErrorInfo(null);
    try {
      const result = await deps.onSubmit(ticket.folderName);
      if (result?.error) setErrorInfo(toErrorInfo(result.error));
      else close();
    } catch (err: any) {
      setErrorInfo({ title: "Cleanup failed", description: err?.message ?? "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    void doSubmit();
  }

  async function openKillDialog(): Promise<void> {
    const ticket = deps.ticket();
    if (!ticket) return;
    setKillDialogOpen(true);
    setLockingProcesses(undefined);
    try {
      const processes = await deps.loadLockingProcesses(deps.projectSlug(), ticket.folderName);
      setLockingProcesses(processes);
    } catch {
      setLockingProcesses([]);
    }
  }

  async function confirmKill(): Promise<void> {
    const ticket = deps.ticket();
    const processes = lockingProcesses();
    if (!ticket || !processes || processes.length === 0) return;
    setKillingProcesses(true);
    try {
      const result = await deps.killLockingProcesses(
        deps.projectSlug(), ticket.folderName, processes.map(p => p.pid),
      );
      if (result.error) setErrorInfo(toErrorInfo(result.error));
    } catch (err: any) {
      setErrorInfo({ description: err?.message ?? 'Failed to kill processes' });
    } finally {
      setKillingProcesses(false);
      closeKillDialog();
      await startChecks();
    }
  }

  function openForceDeleteDialog(): void {
    setForceDeleteDialogOpen(true);
  }

  async function confirmForceDelete(): Promise<void> {
    const ticket = deps.ticket();
    if (!ticket) return;
    setForceDeleting(true);
    try {
      const result = await deps.forceDeleteLocalBranch(deps.projectSlug(), ticket.folderName);
      if (result.error) setErrorInfo(toErrorInfo(result.error));
    } catch (err: any) {
      setErrorInfo({ description: err?.message ?? 'Failed to force-delete branch' });
    } finally {
      setForceDeleting(false);
      closeForceDeleteDialog();
      await startChecks();
    }
  }

  function closeForceDeleteDialog(): void {
    setForceDeleteDialogOpen(false);
  }

  function closeKillDialog(): void {
    setKillDialogOpen(false);
    setLockingProcesses(undefined);
  }

  function close() {
    lifecycleToken++;
    requestToken++;
    deps.onOpenChange(false);
    setErrorInfo(null);
    setItems(allChecking());
    setRunningItem(undefined);
    closeKillDialog();
    closeForceDeleteDialog();
  }

  return {
    items, runningItem, submitting, busy, errorInfo, actionLabel,
    runCleanup, startChecks, doSubmit, handleSubmit, close,
    killDialogOpen, lockingProcesses, killingProcesses,
    openKillDialog, confirmKill, closeKillDialog,
    forceDeleteDialogOpen, forceDeleting,
    openForceDeleteDialog, confirmForceDelete, closeForceDeleteDialog,
  };
}

export type TicketCleanupController = ReturnType<typeof createTicketCleanupController>;
