import { createContext, useContext } from "solid-js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

export type BoardShortcut = MergedLauncherConfig["shortcuts"][number];

export interface ShortcutRunner {
  shortcuts: () => BoardShortcut[];
  running: () => string;
  run: (ticket: TicketInfo, name: string) => void;
  openWorktree: (ticket: TicketInfo) => void;
}

export const ShortcutRunnerContext = createContext<ShortcutRunner>();

export function useShortcutRunner(): ShortcutRunner | undefined {
  return useContext(ShortcutRunnerContext);
}
