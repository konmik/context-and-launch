import { createSignal, createEffect } from "solid-js";
import { extractProfiles } from "./conflict-dialog-pure.js";

export interface ConflictDialogDeps {
  projectSlug: () => string;
  open: () => boolean;
  onResolve: (profileName: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function createConflictDialogController(deps: ConflictDialogDeps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");
  const [profiles, setProfiles] = createSignal<{ name: string }[]>([]);
  const [selectedProfile, setSelectedProfile] = createSignal("");

  createEffect(() => {
    if (deps.open()) {
      setErrorMsg("");
      fetch(`/api/projects/${deps.projectSlug()}/launcher-config`)
        .then(r => r.json())
        .then(data => {
          const list = extractProfiles(data);
          setProfiles(list);
          if (list.length > 0 && !selectedProfile()) {
            setSelectedProfile(list[0].name);
          }
        })
        .catch(() => setErrorMsg("Failed to load profiles"));
    }
  });

  function close() {
    deps.onOpenChange(false);
    setErrorMsg("");
  }

  async function submit(
    action: () => Promise<void>, fallbackMsg: string,
  ) {
    setSubmitting(true);
    setErrorMsg("");
    try {
      await action();
      close();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : fallbackMsg,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resolve() {
    return submit(
      () => deps.onResolve(selectedProfile()),
      "Failed to launch resolver",
    );
  }

  function abort() {
    return submit(deps.onAbort, "Failed to abort");
  }

  return {
    submitting, errorMsg, profiles, selectedProfile,
    setSelectedProfile, close, resolve, abort,
  };
}

export type ConflictDialogController = ReturnType<
  typeof createConflictDialogController
>;
