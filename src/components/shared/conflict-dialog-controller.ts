import { createSignal, createEffect, useContext } from "solid-js";
import { getMergedLauncherConfig } from "../launcher/launcher-api.js";
import { AppConfigContext } from '../config/app-config-storage.js';

export interface ConflictDialogDeps {
  projectSlug: () => string;
  open: () => boolean;
  onResolve: (profileName: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function createConflictDialogController(deps: ConflictDialogDeps) {
  const appConfig = useContext(AppConfigContext)!;
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");
  const [profiles, setProfiles] = createSignal<{ name: string }[]>([]);
  const [selectedProfile, setSelectedProfile] = createSignal("");

  createEffect(
    () => [deps.open(), deps.projectSlug()] as const,
    ([open, projectSlug]) => {
    if (open) {
      let cancelled = false;
      setErrorMsg("");
      getMergedLauncherConfig(projectSlug)
        .then(async data => {
          if (cancelled) return;
          const list = data.profiles;
          setProfiles(list);
          if (list.length === 0) return;
          const current = selectedProfile();
          if (current && list.some(p => p.name === current)) return;
          const preferred = appConfig.get().lastUsedProfileName;
          const match = preferred && list.some(p => p.name === preferred)
            ? preferred
            : list[0].name;
          if (!cancelled) setSelectedProfile(match);
        })
        .catch(() => { if (!cancelled) setErrorMsg("Failed to load profiles"); });
      return () => { cancelled = true; };
    }
  });

  async function selectProfile(name: string) {
    setSelectedProfile(name);
    if (!name) return;
    try {
      const result = await appConfig.update(current => ({ ...current, lastUsedProfileName: name }));
      if (result.type === 'Failure') setErrorMsg(result.error);
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
