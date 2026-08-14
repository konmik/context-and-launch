import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "~/test-render.js";
import { SplitPane } from "./split-pane.js";

afterEach(cleanup);

describe("SplitPane", () => {
  it("persists the new keyboard size rather than the previous signal value", () => {
    const onChangeEnd = vi.fn();
    const view = render(() => (
      <SplitPane
        initialPercent={50}
        onChangeEnd={onChangeEnd}
        first={<div>First</div>}
        second={<div>Second</div>}
      />
    ));

    fireEvent.keyDown(view.getByRole("separator"), { key: "ArrowRight" });

    expect(onChangeEnd).toHaveBeenCalledWith([52, 48]);
  });
});
