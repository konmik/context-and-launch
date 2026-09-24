import { Show, createEffect, useContext } from "solid-js";
import BoardSelect from "./BoardSelect.js";
import { BoardConfigContext } from '../board/board-config-storage.js';

interface BoardSelectorProps {
  boardId: string;
  setBoardId: (v: string) => void;
}

export default function BoardSelector(props: BoardSelectorProps) {
  const boards = useContext(BoardConfigContext)!.get;
  createEffect(() => [boards(), props.boardId] as const, ([data, id]) => {
    if (!data.some(board => board.id === id)) props.setBoardId(data[0]?.id ?? '');
  });

  return (
    <Show when={boards().length > 1}>
      <div class="mb-4">
        <label for="project-board" class="field-label">Board Definition</label>
        <BoardSelect
          boards={boards()}
          value={props.boardId}
          onChange={(e) => props.setBoardId(e.currentTarget.value)}
          class="input"
          testId="add-project-board-select"
          id="project-board"
        />
      </div>
    </Show>
  );
}
