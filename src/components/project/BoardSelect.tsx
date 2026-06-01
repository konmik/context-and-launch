import { For } from "solid-js";
import type { BoardRef } from "~/lib/fetch-boards.js";

export interface BoardSelectProps {
  boards: BoardRef[];
  value: string;
  onChange: (e: Event & { currentTarget: HTMLSelectElement }) => void;
  class?: string;
  testId?: string;
  id?: string;
}

export default function BoardSelect(props: BoardSelectProps) {
  return (
    <select
      id={props.id}
      value={props.value}
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
