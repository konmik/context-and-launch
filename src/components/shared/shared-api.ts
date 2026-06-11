import fs from "fs";
import { launcherConfigManager, worktreeManager } from "~/core/config/instances.js";
import { openInOs } from "~/core/infra/open-in-os.js";
import { openFileDialog } from "~/core/infra/native-file-dialog.js";
import { NotFoundError, errorMessage } from "~/core/shared/errors.js";

export async function openConfigDir(
  scope?: string, projectSlug?: string,
): Promise<void> {
  "use server";
  let dir: string;
  if (scope === "tickets" && projectSlug) dir = worktreeManager.getWorktreeDir(projectSlug);
  else if (scope === "project" && projectSlug) dir = launcherConfigManager.getProjectDir(projectSlug);
  else dir = launcherConfigManager.getAppConfigDir();
  if (!fs.existsSync(dir)) throw new NotFoundError(`Directory does not exist: ${dir}`);
  await openInOs(dir);
}

export async function openNativeFileBrowser(
  startDir?: string,
): Promise<string[]> {
  "use server";
  return openFileDialog(startDir);
}

export async function pickDirectory(
  preselect: string,
): Promise<{ path: string } | { cancelled: true } | { error: string }> {
  "use server";
  const { execFile } = await import("child_process");
  const { readFileSync } = await import("fs");
  const { normalizeMacPickedPath } = await import("~/core/infra/picker-paths.js");

  type PickerResult =
    | { kind: "picked"; path: string }
    | { kind: "cancelled" }
    | { kind: "errored"; message: string }
    | { kind: "unavailable" };

  function runWindowsPicker(exe: string, encoded: string): Promise<PickerResult> {
    return new Promise((resolve) => {
      execFile(
        exe, ["-STA", "-NoProfile", "-EncodedCommand", encoded],
        { timeout: 600000 },
        (err, stdout, stderr) => {
          if (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") { resolve({ kind: "unavailable" }); return; }
            if ((err as { code?: number }).code === 1) { resolve({ kind: "cancelled" }); return; }
            resolve({ kind: "errored", message: stderr.trim() || (err as Error).message }); return;
          }
          const picked = stdout.trim();
          if (!picked) { resolve({ kind: "cancelled" }); return; }
          resolve({ kind: "picked", path: picked });
        },
      );
    });
  }

  function buildWindowsPickerScript(initial: string): string {
    const initialDir = initial
      ? `$d.InitialDirectory = '${initial.replace(/'/g, "''")}'\n`
      : "";
    return `
Add-Type -AssemblyName PresentationFramework
$p = @{ Width=0; Height=0; WindowStyle='None'
  ShowInTaskbar=$false; Topmost=$true }
$h = New-Object System.Windows.Window -Property $p
$h.Show()
$d = New-Object Microsoft.Win32.OpenFolderDialog
$d.Title = 'Select directory'
${initialDir}$r = $d.ShowDialog($h)
$h.Close()
if ($r) { $d.FolderName } else { exit 1 }
`;
  }

  function runMacPicker(initial: string): Promise<PickerResult> {
    const escaped = initial.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const defaultLoc = initial ? ` default location POSIX file "${escaped}"` : "";
    const script = `POSIX path of (choose folder with prompt "Select directory"${defaultLoc})`;
    return new Promise((resolve) => {
      execFile("osascript", ["-e", script], { timeout: 600000 }, (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") { resolve({ kind: "unavailable" }); return; }
          if (/-128|User canceled|User cancelled/.test(stderr)) { resolve({ kind: "cancelled" }); return; }
          resolve({ kind: "errored", message: stderr.trim() || (err as Error).message }); return;
        }
        resolve({ kind: "picked", path: normalizeMacPickedPath(stdout) });
      });
    });
  }

  function runZenity(initial: string): Promise<PickerResult> {
    const args = ["--file-selection", "--directory", "--title=Select directory"];
    if (initial) args.push(`--filename=${initial.replace(/\/?$/, "/")}`);
    return new Promise((resolve) => {
      execFile("zenity", args, { timeout: 600000 }, (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") { resolve({ kind: "unavailable" }); return; }
          if ((err as { code?: number }).code === 1) { resolve({ kind: "cancelled" }); return; }
          resolve({ kind: "errored", message: stderr.trim() || (err as Error).message }); return;
        }
        resolve({ kind: "picked", path: stdout.trim() });
      });
    });
  }

  function runKdialog(initial: string): Promise<PickerResult> {
    const start = initial || process.env.HOME || "/";
    return new Promise((resolve) => {
      execFile("kdialog", ["--getexistingdirectory", start], { timeout: 600000 }, (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") { resolve({ kind: "unavailable" }); return; }
          if ((err as { code?: number }).code === 1) { resolve({ kind: "cancelled" }); return; }
          resolve({ kind: "errored", message: stderr.trim() || (err as Error).message }); return;
        }
        resolve({ kind: "picked", path: stdout.trim() });
      });
    });
  }

  async function pickByPlatform(initial: string): Promise<PickerResult> {
    const stubFile = process.env.CONTEXT_PICKER_STUB_FILE;
    const stub = stubFile ? readFileSync(stubFile, "utf-8").trim() : process.env.CONTEXT_PICKER_STUB;
    if (stub === "__cancel__") return { kind: "cancelled" };
    if (stub === "__unavailable__") return { kind: "unavailable" };
    if (stub === "__error__") return { kind: "errored", message: "Stubbed picker error" };
    if (stub) return { kind: "picked", path: stub };
    if (process.platform === "darwin") return runMacPicker(initial);
    if (process.platform === "win32") {
      const encoded = Buffer.from(buildWindowsPickerScript(initial), "utf16le").toString("base64");
      const first = await runWindowsPicker("pwsh", encoded);
      if (first.kind !== "unavailable") return first;
      return runWindowsPicker("powershell", encoded);
    }
    const zen = await runZenity(initial);
    if (zen.kind !== "unavailable") return zen;
    return runKdialog(initial);
  }

  const result = await pickByPlatform(preselect);
  if (result.kind === "picked") return { path: result.path };
  if (result.kind === "cancelled") return { cancelled: true };
  if (result.kind === "errored") return { error: result.message };
  return {
    error: `No directory picker is available on ${process.platform}. `
      + "Install zenity or kdialog (Linux), or paste the path manually.",
  };
}
