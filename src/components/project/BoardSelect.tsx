import { For, createEffect } from "solid-js";
import type { BoardRef } from "../board/board-api.js";

export interface BoardSelectProps {
  boards: BoardRef[];
  value: string;
  onChange: (e: Event & { currentTarget: HTMLSelectElement }) => void;
  class?: string;
  testId?: string;
  id?: string;
}

export default function BoardSelect(props: BoardSelectProps) {
  let ref!: HTMLSelectElement;
  createEffect(() => {
    const v = props.value;
    void props.boards;
    queueMicrotask(() => { ref.value = v; });
  });
  return (
    <select
      ref={ref}
      id={props.id}
      onChange={props.onChange}
      class={props.class}
      data-testid={props.testId}
    >
      <For each={props.boards}>
        {(board) => <option value={board.id}>{board.name}</option>}
      </For>
    </select>
  );
}
