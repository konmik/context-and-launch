import { createSignal } from "solid-js";
import { runShortcut as runShortcutAction } from "../launcher/launcher-api.js";

export interface ShortcutDeps {
  projectSlug: string;
  folderName: () => string;
  useWorktree: () => boolean;
  launchDir: () => string;
  setError: (msg: string) => void;
}

export function createShortcutState(deps: ShortcutDeps) {
  const [runningShortcut, setRunningShortcut] = createSignal("");
  const [dirtyWorktreeShortcut, setDirtyWorktreeShortcut] = createSignal<
    { name: string; message: string } | null
  >(null);

  async function runShortcut(name: string, force?: boolean) {
    setRunningShortcut(name);
    deps.setError("");
    try {
      const result = await runShortcutAction(
        deps.projectSlug, deps.folderName(), name, deps.useWorktree(), force ?? false, deps.launchDir(),
      );
      if (!result.ok) {
        if (result.type === "dirtyWorktree") {
          setDirtyWorktreeShortcut({ name, message: result.message });
          return;
        }
        deps.setError(result.message);
      }
    } catch (e: any) {
      deps.setError(e?.message ?? "Network error");
    } finally {
      setRunningShortcut("");
    }
  }

  return {
    runningShortcut, dirtyWorktreeShortcut, setDirtyWorktreeShortcut,
    runShortcut,
  };
}
