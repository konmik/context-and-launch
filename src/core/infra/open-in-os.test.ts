import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openInOs } from "./open-in-os.js";
import type {
  CommandTemplateExecutor, CommandTemplateKey, CommandTemplateValues,
} from "../command-template/command-template-types.js";

function recordingExecutor(): {
  executor: CommandTemplateExecutor;
  calls: { key: CommandTemplateKey; cwd: string; values?: CommandTemplateValues }[];
} {
  const calls: { key: CommandTemplateKey; cwd: string; values?: CommandTemplateValues }[] = [];
  const executor: CommandTemplateExecutor = {
    execute: async (key, cwd, values) => { calls.push({ key, cwd, values }); return ""; },
    executeSync: () => { throw new Error("not used"); },
    render: () => { throw new Error("not used"); },
  };
  return { executor, calls };
}

describe("openInOs", () => {
  let prevStub: string | undefined;
  beforeEach(() => {
    prevStub = process.env.CONTEXT_OPEN_IN_OS_STUB;
    delete process.env.CONTEXT_OPEN_IN_OS_STUB;
  });
  afterEach(() => {
    if (prevStub === undefined) delete process.env.CONTEXT_OPEN_IN_OS_STUB;
    else process.env.CONTEXT_OPEN_IN_OS_STUB = prevStub;
  });

  it("hands the file manager a native-separator path", async () => {
    const { executor, calls } = recordingExecutor();
    const forwardSlashed = "C:/Users/x/worktrees/t-1-alpha";
    await openInOs(forwardSlashed, executor);
    const expected = path.normalize(forwardSlashed);
    expect(calls).toHaveLength(1);
    expect(calls[0].cwd).toBe(expected);
    expect(calls[0].values).toEqual({ directory: expected });
  });
});
