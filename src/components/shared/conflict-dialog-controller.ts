import { createSignal, createEffect } from "solid-js";
import { extractProfiles } from "./conflict-dialog-pure.js";
import { getMergedLauncherConfig, getLastUsedProfile, saveLastUsedProfile } from "../launcher/launcher-api.js";

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
      getMergedLauncherConfig(deps.projectSlug())
        .then(async data => {
          const list = extractProfiles(data);
          setProfiles(list);
          if (list.length === 0) return;
          const current = selectedProfile();
          if (current && list.some(p => p.name === current)) return;
          let preferred: string | null = null;
          try {
            preferred = await getLastUsedProfile();
          } catch (e) {
            console.warn("Failed to load last-used profile:", e);
          }
          const match = preferred && list.some(p => p.name === preferred)
            ? preferred
            : list[0].name;
          setSelectedProfile(match);
        })
        .catch(() => setErrorMsg("Failed to load profiles"));
    }
  });

  async function selectProfile(name: string) {
    setSelectedProfile(name);
    if (!name) return;
    try {
      await saveLastUsedProfile(name);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save last used profile",
      );
    }
  }

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
    setSelectedProfile, selectProfile, close, resolve, abort,
  };
}

export type ConflictDialogController = ReturnType<
  typeof createConflictDialogController
>;
