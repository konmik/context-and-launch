import { Show } from "solid-js";
import {
  createAddProjectController,
  type AddProjectController,
  type AddProjectAction,
} from "./add-project-controller.js";
import BoardSelector from "./BoardSelector.js";

interface AddProjectFormProps {
  action: AddProjectAction;
  errorMessage?: string;
  onSuccess?: (projectSlug: string) => void;
  submitTitle?: string;
  ctrl?: AddProjectController;
}

export default function AddProjectForm(props: AddProjectFormProps) {
  const s = props.ctrl ?? createAddProjectController({
    action: props.action,
    onSuccess: props.onSuccess,
    errorMessage: props.errorMessage,
  });

  return (
    <form onSubmit={s.handleSubmit}>
      <div class="mb-4">
        <label for="project-name" class="field-label">Project name</label>
        <input
          id="project-name"
          type="text"
          value={s.nameValue()}
          onInput={(e) => s.setNameValue(e.currentTarget.value)}
          placeholder="Optional display name"
          class="input"
          data-testid="add-project-name-input"
        />
      </div>
      <div class="mb-4">
        <label for="project-path" class="field-label">Git Repository Path</label>
        <div class="flex gap-2">
          <input
            id="project-path"
            type="text"
            value={s.pathValue()}
            onInput={(e) => s.setPathValue(e.currentTarget.value)}
            placeholder="/path/to/your/repo"
            class="input"
            data-testid="add-project-path-input"
          />
          <button
            type="button"
            onClick={s.handleBrowsePath}
            class="btn-secondary"
            data-testid="add-project-path-browse"
          >Browse</button>
        </div>
      </div>
      <BoardSelector
        boardId={s.boardId}
        setBoardId={s.setBoardId}
        onError={s.setLocalError}
      />
      <div class="mb-4">
        <label for="project-main-branch" class="field-label">Main branch</label>
        <input
          id="project-main-branch"
          type="text"
          value={s.mainBranchValue()}
          onInput={(e) => s.setMainBranchValue(e.currentTarget.value)}
          placeholder="Auto-detected from repository"
          class="input"
          data-testid="add-project-main-branch-input"
        />
      </div>
      <div class="mb-4">
        <label for="project-branch" class="field-label">Tickets branch name</label>
        <input
          id="project-branch"
          type="text"
          value={s.branchValue()}
          onInput={(e) => s.setBranchValue(e.currentTarget.value)}
          placeholder="tickets"
          class="input"
          data-testid="add-project-branch-input"
        />
      </div>
      <Show when={s.localError()}><p class="mb-4 text-sm text-destructive">{s.localError()}</p></Show>
      <button
        type="submit"
        disabled={s.submitting() || !s.pathValue().trim()}
        title={props.submitTitle}
        class="btn-primary w-full"
        data-testid="add-project-submit"
      >
        Add Project
      </button>
    </form>
  );
}
