import { createSignal, createMemo } from "solid-js";
import { createShortcutState } from "../ticket/ticket-detail-shortcuts.js";
import { openTicketWorktree } from "../ticket/ticket-api.js";
import { computeLaunchDir } from "../launcher/agent-launcher-pure.js";
import type { MergedLauncherConfigWithMeta } from "../launcher/launcher-api.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";

export function createBoardShortcutRunner(deps: {
  projectSlug: () => string;
  config: () => MergedLauncherConfigWithMeta | undefined;
}) {
  const [activeTicket, setActiveTicket] = createSignal<TicketInfo>();
  const [error, setError] = createSignal<ErrorInfo | null>(null);

  const launchDir = createMemo(() => {
    const ticket = activeTicket();
    const config = deps.config();
    if (!ticket || !config) return "";
    return computeLaunchDir({
      useWorktree: ticket.useWorktree,
      projectPath: config.projectPath,
      worktreeRootPath: config.worktreeRootPath,
      agentWorktreeDir: config.agentWorktreeDir,
      folderName: ticket.folderName,
      savedAgentWorktreeDir: ticket.agentWorktreeDir,
    });
  });

  const shortcutState = createShortcutState({
    projectSlug: deps.projectSlug,
    folderName: () => activeTicket()?.folderName ?? "",
    useWorktree: () => activeTicket()?.useWorktree ?? false,
    launchDir,
    setError,
  });

  function run(ticket: TicketInfo, name: string) {
    setActiveTicket(ticket);
    void shortcutState.runShortcut(name);
  }

  async function openWorktree(ticket: TicketInfo) {
    setError(null);
    try {
      const result = await openTicketWorktree(deps.projectSlug(), ticket.folderName);
      if (!result.ok) setError(result.errorInfo);
    } catch (e) {
      setError(errorPayload(e, "Open failed"));
    }
  }

  return {
    shortcuts: () => deps.config()?.shortcuts ?? [],
    running: shortcutState.runningShortcut,
    confirmation: shortcutState.shortcutConfirmation,
    setConfirmation: shortcutState.setShortcutConfirmation,
    proceed: (name: string) => void shortcutState.runShortcut(name, true),
    error,
    setError,
    run,
    openWorktree: (ticket: TicketInfo) => void openWorktree(ticket),
  };
}
