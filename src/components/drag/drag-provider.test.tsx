import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "~/test-render.js";
import { DragDropProvider, createSortable } from "./drag-provider.js";

afterEach(cleanup);

function Sortable(props: { id: string }) {
  const sortable = createSortable(props.id);
  return <button ref={sortable.ref} {...sortable.dragActivators}>{props.id}</button>;
}

describe("DragDropProvider keyboard dragging", () => {
  it("walks through drop targets and submits the selected target", () => {
    const onDragOver = vi.fn();
    const onDragEnd = vi.fn();
    const view = render(() => (
      <DragDropProvider onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <Sortable id="one" />
        <Sortable id="two" />
        <Sortable id="three" />
      </DragDropProvider>
    ));
    const source = view.getByRole("button", { name: "one" });

    fireEvent.keyDown(source, { key: "Enter" });
    fireEvent.keyDown(source, { key: "ArrowDown" });
    fireEvent.keyDown(source, { key: "ArrowDown" });
    fireEvent.keyDown(source, { key: "Enter" });

    expect(onDragOver.mock.calls.map(([event]) => event.droppable.id)).toEqual(["two", "three"]);
    expect(onDragEnd.mock.calls[0][0].droppable.id).toBe("three");
  });
});
