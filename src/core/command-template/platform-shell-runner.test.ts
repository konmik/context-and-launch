import { describe, it, expect } from "vitest";
import { runCapturedScript } from "./platform-shell-runner.test-utils.js";
import { shellLiteral } from "./command-template-interpolation.js";
import { currentCommandTemplatePlatform } from "./command-template-types.js";
import { ProcessError } from "../shared/errors.js";
import { useTempDirs } from "./platform-shell-fixture.test-utils.js";

const makeTempDir = useTempDirs("platform-shell-runner-test-", { cleanupAfterAll: true });

const platform = currentCommandTemplatePlatform();

/** PowerShell needs the call operator for a quoted executable path. */
function quoted(executable: string): string {
  const literal = shellLiteral(executable, platform);
  return platform === "windows" ? `& ${literal}` : literal;
}

describe("platform shell runner failure classification", () => {
  // Before the wrapper reserved distinct codes, `pwsh -Command` collapsed every
  // non-zero exit to 1, so these two cases were indistinguishable. Callers such
  // as merge-tree conflict detection and Herdr availability depend on telling
  // them apart, so assert the distinction directly against the real shell.
  it.concurrent("reports a command the shell cannot resolve as command-not-found", async () => {
    const cwd = makeTempDir();
    const promise = runCapturedScript("definitely-not-a-real-executable-xyz", cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toMatchObject({ kind: "command-not-found" });
  });

  it.concurrent("reports a command that chose its own non-zero exit as exited", async () => {
    const cwd = makeTempDir();
    const script = `${quoted(process.execPath)} -e "process.exit(1)"`;
    const promise = runCapturedScript(script, cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toMatchObject({ kind: "exited", exitCode: 1 });
  });

  it.concurrent("preserves a command's own exit code rather than collapsing it to 1", async () => {
    const cwd = makeTempDir();
    const script = `${quoted(process.execPath)} -e "process.exit(42)"`;
    await expect(runCapturedScript(script, cwd))
      .rejects.toMatchObject({ kind: "exited", exitCode: 42 });
  });

  // A program supplied through a placeholder renders as a quoted literal. On
  // PowerShell that would be a parse error -- an untrappable exit 1 -- so the
  // runner adds the call operator and the missing program stays classifiable.
  it.concurrent("classifies a quoted missing executable as command-not-found", async () => {
    const cwd = makeTempDir();
    const script = `${shellLiteral("definitely-not-a-real-executable-xyz", platform)} --version`;
    const promise = runCapturedScript(script, cwd);
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
    await expect(promise).rejects.toMatchObject({ kind: "command-not-found" });
  });

  it.concurrent("runs a quoted executable path that does exist", async () => {
    const cwd = makeTempDir();
    const script = `${shellLiteral(process.execPath, platform)} -e "process.stdout.write('ok')"`;
    await expect(runCapturedScript(script, cwd)).resolves.toContain("ok");
  });

  it.concurrent("only answers exitedWith for a code the command itself chose", async () => {
    const cwd = makeTempDir();
    const missing = await runCapturedScript("definitely-not-a-real-executable-xyz", cwd)
      .then(() => { throw new Error("expected a failure"); }, (error: unknown) => error as ProcessError);
    const refused = await runCapturedScript(`${quoted(process.execPath)} -e "process.exit(1)"`, cwd)
      .then(() => { throw new Error("expected a failure"); }, (error: unknown) => error as ProcessError);
    expect(refused.exitedWith(1)).toBe(true);
    expect(missing.exitedWith(1)).toBe(false);
  });
});
