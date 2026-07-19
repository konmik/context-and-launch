import { createSignal } from "solid-js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import type { CleanupItemKey, TicketCleanupStatus } from "~/core/worktree/ticket-cleanup-checks.js";
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
}

export function createTicketCleanupController(deps: TicketCleanupDeps) {
  const [items, setItems] = createSignal<TicketCleanupItemStates>(allChecking());
  const [runningItem, setRunningItem] = createSignal<CleanupItemKey>();
  const [submitting, setSubmitting] = createSignal(false);
  const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);

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
  const busy = () => submitting() || runningItem() !== undefined;

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

  function close() {
    lifecycleToken++;
    requestToken++;
    deps.onOpenChange(false);
    setErrorInfo(null);
    setItems(allChecking());
    setRunningItem(undefined);
  }

  return {
    items, runningItem, submitting, busy, errorInfo, actionLabel,
    runCleanup, startChecks, doSubmit, handleSubmit, close,
  };
}

export type TicketCleanupController = ReturnType<typeof createTicketCleanupController>;
