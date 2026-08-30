import { describe, expect, it } from "vitest";
import { parseMountTable, planRuntimeMount } from "./test-runtime-mount.mjs";

const runtimeRoot = "C:\\Users\\tester\\AppData\\Local\\context-launch-test-runtime";
const liveRuntime = `${runtimeRoot}\\project-3f858b29`;
const removedRuntime = `${runtimeRoot}\\project-a66e0e9a`;
const otherRuntime = "C:\\Users\\tester\\AppData\\Local\\Temp\\other-runtime";
const newRuntime = `${runtimeRoot}\\project-1b2c3d4e`;

const substOutput = [
  `U:\\: => ${liveRuntime}`,
  `W:\\: => ${otherRuntime}`,
  `X:\\: => ${removedRuntime}`,
  `Y:\\: => ${removedRuntime}`,
  `Z:\\: => ${removedRuntime}`,
  "",
].join("\r\n");

function directoryExists(candidate: string): boolean {
  return candidate === liveRuntime || candidate === otherRuntime;
}

describe("parseMountTable", () => {
  it("reads the drive and target of every mapping", () => {
    expect(parseMountTable(substOutput)).toEqual([
      { drive: "U:", target: liveRuntime },
      { drive: "W:", target: otherRuntime },
      { drive: "X:", target: removedRuntime },
      { drive: "Y:", target: removedRuntime },
      { drive: "Z:", target: removedRuntime },
    ]);
  });

  it("reads an empty table", () => {
    expect(parseMountTable("\r\n")).toEqual([]);
  });
});

describe("planRuntimeMount", () => {
  it("releases mappings whose target no longer exists and reuses the letter", () => {
    const plan = planRuntimeMount(parseMountTable(substOutput), newRuntime, directoryExists);
    expect(plan.release).toEqual(["X:", "Y:", "Z:"]);
    expect(plan.drive).toBe("Z:");
  });

  it("releases a stale mapping that already points at the runtime being mounted", () => {
    const plan = planRuntimeMount(parseMountTable(substOutput), liveRuntime, directoryExists);
    expect(plan.release).toContain("U:");
    expect(plan.drive).toBe("Z:");
  });

  it("skips letters taken by a real drive", () => {
    const plan = planRuntimeMount([], newRuntime, (candidate) =>
      candidate === "Z:\\" || candidate === "Y:\\");
    expect(plan.release).toEqual([]);
    expect(plan.drive).toBe("X:");
  });

  it("fails when every candidate letter is taken", () => {
    expect(() => planRuntimeMount([], newRuntime, () => true)).toThrow(/drive letter/i);
  });
});
