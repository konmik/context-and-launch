import { Show, createSignal, type Accessor } from "solid-js";
import BoardSelect from "./BoardSelect.js";
import { fetchBoards, type BoardRef } from "~/lib/fetch-boards.js";

interface BoardSelectorProps {
  boardId: Accessor<string>;
  setBoardId: (v: string) => void;
  onError?: (msg: string) => void;
}

export default function BoardSelector(props: BoardSelectorProps) {
  const [boards, setBoards] = createSignal<BoardRef[]>([]);

  fetchBoards()
    .then((data) => {
      setBoards(data);
      if (!props.boardId()) props.setBoardId(data[0].id);
    })
    .catch((err: any) => props.onError?.(err?.message ?? "Failed to load boards"));

  return (
    <Show when={boards().length > 1}>
      <div class="mb-4">
        <label for="project-board" class="mb-2 block text-sm font-medium">Board Definition</label>
        <BoardSelect
          boards={boards()}
          value={props.boardId()}
          onChange={(e) => props.setBoardId(e.currentTarget.value)}
          class="input"
          testId="add-project-board-select"
          id="project-board"
        />
      </div>
    </Show>
  );
}
