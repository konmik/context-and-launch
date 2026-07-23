import { describe, it, expect } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Suspense, createSignal } from "solid-js";
import { createNonSuspendingAsync } from "./create-non-suspending-async.js";

function renderInSuspense(Consumer: () => import("solid-js").JSX.Element) {
  return render(() => (
    <Suspense fallback={<div data-testid="fallback" />}>
      <Consumer />
    </Suspense>
  ));
}

describe("createNonSuspendingAsync", () => {
  it("does not collapse the surrounding Suspense boundary while the first fetch is pending", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((r) => { resolve = r; });
    const { getByTestId, queryByTestId } = renderInSuspense(() => {
      const data = createNonSuspendingAsync(() => pending);
      return <div data-testid="value">{data() ?? "empty"}</div>;
    });
    expect(queryByTestId("fallback")).toBeNull();
    expect(getByTestId("value").textContent).toBe("empty");
    resolve("loaded");
    await waitFor(() => expect(getByTestId("value").textContent).toBe("loaded"));
    expect(queryByTestId("fallback")).toBeNull();
  });

  it("returns the initial value synchronously when one is given", () => {
    const { getByTestId } = renderInSuspense(() => {
      const data = createNonSuspendingAsync(() => Promise.resolve("loaded"), { initialValue: "initial" });
      return <div data-testid="value">{data()}</div>;
    });
    expect(getByTestId("value").textContent).toBe("initial");
  });

  it("keeps returning the previous value during a refetch instead of suspending", async () => {
    let resolveSecond!: (value: string) => void;
    let bump!: () => void;
    const { getByTestId, queryByTestId } = renderInSuspense(() => {
      const [version, setVersion] = createSignal(0);
      bump = () => setVersion(1);
      const data = createNonSuspendingAsync(() =>
        version() === 0
          ? Promise.resolve("first")
          : new Promise<string>((r) => { resolveSecond = r; }));
      return <div data-testid="value">{data() ?? "empty"}</div>;
    });
    await waitFor(() => expect(getByTestId("value").textContent).toBe("first"));
    bump();
    expect(getByTestId("value").textContent).toBe("first");
    expect(queryByTestId("fallback")).toBeNull();
    resolveSecond("second");
    await waitFor(() => expect(getByTestId("value").textContent).toBe("second"));
  });
});
