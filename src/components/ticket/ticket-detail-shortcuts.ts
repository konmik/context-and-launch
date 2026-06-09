import { createSignal } from "solid-js";

export interface ShortcutDeps {
  ticketUrl: (suffix: string) => string;
  useWorktree: () => boolean;
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
      const res = await fetch(
        deps.ticketUrl("shortcut/run"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, useWorktree: deps.useWorktree(), force }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 409 && res.headers.get("content-type")?.includes("application/json")) {
          const data = JSON.parse(text);
          if (data.dirtyWorktree) {
            setDirtyWorktreeShortcut({ name, message: data.message });
            return;
          }
        }
        deps.setError(text || `Error ${res.status}`);
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
