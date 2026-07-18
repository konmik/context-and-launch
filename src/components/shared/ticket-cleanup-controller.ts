import { createSignal } from "solid-js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import type { CleanupItemKey, TicketCleanupStatus } from "~/core/worktree/ticket-cleanup-checks.js";
import {
  type TicketCleanupOptions, type TicketCleanupItemStates,
  noCleanupOptions, possibleCleanupOptions, toErrorInfo,
  allChecking, allError, effectiveCleanupOptions,
} from "./ticket-cleanup-pure.js";

export interface TicketCleanupDeps {
  projectSlug: () => string;
  ticket: () => TicketInfo | null;
  action: () => "archive" | "delete";
  loadStatus: (projectSlug: string, folderName: string) => Promise<TicketCleanupStatus>;
  onSubmit: (
    folderName: string, cleanup: TicketCleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  onOpenChange: (open: boolean) => void;
}

export function createTicketCleanupController(deps: TicketCleanupDeps) {
  const [items, setItems] = createSignal<TicketCleanupItemStates>(allChecking());
  const [options, setOptions] = createSignal<TicketCleanupOptions>(noCleanupOptions());
  const [submitting, setSubmitting] = createSignal(false);
  const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);

  let requestToken = 0;

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
        setOptions(possibleCleanupOptions(status));
      }
    } catch (err: any) {
      if (token === requestToken) {
        setItems(allError(toErrorInfo(err?.message ?? "Failed to check cleanup status")));
      }
    }
  }

  function isChecked(key: CleanupItemKey): boolean {
    return options()[key] && items()[key].state === "ready";
  }

  function updateOption(key: CleanupItemKey, value: boolean) {
    setOptions({ ...options(), [key]: value });
  }

  const actionLabel = () => deps.action() === "archive" ? "Archive" : "Delete";

  async function doSubmit() {
    const ticket = deps.ticket();
    if (!ticket || submitting()) return;
    setSubmitting(true);
    setErrorInfo(null);
    try {
      const result = await deps.onSubmit(
        ticket.folderName, effectiveCleanupOptions(options(), items()),
      );
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
    deps.onOpenChange(false);
    setErrorInfo(null);
    setItems(allChecking());
    setOptions(noCleanupOptions());
  }

  return {
    items, isChecked, submitting, errorInfo, actionLabel,
    updateOption, startChecks, doSubmit, handleSubmit, close,
  };
}

export type TicketCleanupController = ReturnType<typeof createTicketCleanupController>;
