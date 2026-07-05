import { createSignal } from "solid-js";
import { runShortcut as runShortcutAction } from "../launcher/launcher-api.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";

export interface ShortcutDeps {
  projectSlug: string;
  folderName: () => string;
  useWorktree: () => boolean;
  launchDir: () => string;
  setError: (error: ErrorInfo | null) => void;
}

export function createShortcutState(deps: ShortcutDeps) {
  const [runningShortcut, setRunningShortcut] = createSignal("");
  const [dirtyWorktreeShortcut, setDirtyWorktreeShortcut] = createSignal<
    { name: string; message: string } | null
  >(null);

  async function runShortcut(name: string, force?: boolean) {
    setRunningShortcut(name);
    deps.setError(null);
    try {
      const result = await runShortcutAction(
        deps.projectSlug, deps.folderName(), name, deps.useWorktree(), force ?? false, deps.launchDir(),
      );
      if (!result.ok) {
        if (result.type === "dirtyWorktree") {
          setDirtyWorktreeShortcut({ name, message: result.message });
          return;
        }
        if (result.type === "error") {
          deps.setError({ ...result.errorInfo, title: "Shortcut failed" });
        } else {
          deps.setError({ title: "Shortcut failed", description: result.message });
        }
      }
    } catch (e: unknown) {
      deps.setError(errorPayload(e, "Shortcut failed"));
    } finally {
      setRunningShortcut("");
    }
  }

  return {
    runningShortcut, dirtyWorktreeShortcut, setDirtyWorktreeShortcut,
    runShortcut,
  };
}
