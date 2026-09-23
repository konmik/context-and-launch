import { createSignal, createEffect, createMemo, useContext } from "solid-js";
import { ProjectLauncherConfigContext } from '../launcher/project-launcher-config-storage.js';
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js';
import { AppConfigContext } from '../config/app-config-storage.js';
import { LauncherConfigContext } from '../launcher/shared-launcher-config-storage.js';

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
  const sharedConfig = useContext(LauncherConfigContext)!;
  const projectConfig = useContext(ProjectLauncherConfigContext)!;
  const profiles = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()).profiles);
  const [selectedProfile, setSelectedProfile] = createSignal("");

  createEffect(deps.open, open => { if (open) setErrorMsg(''); });

  createEffect(profiles, list => {
    if (list.some(profile => profile.name === selectedProfile())) return;
    const preferred = appConfig.get().lastUsedProfileName;
    setSelectedProfile(list.find(profile => profile.name === preferred)?.name ?? list[0]?.name ?? '');
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
