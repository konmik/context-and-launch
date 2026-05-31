import { Show } from "solid-js";
import {
  createAddProjectController,
  type AddProjectController,
} from "./add-project-controller.js";

interface AddProjectFormProps {
  action: (
    path: string, branch: string, worktreeRootPath: string, ticketsPath: string,
  ) => Promise<{ projectSlug?: string; error?: string }>;
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
        <label for="project-path" class="mb-2 block text-sm font-medium">Git Repository Path</label>
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
      <div class="mb-4">
        <label for="project-branch" class="mb-2 block text-sm font-medium">Tickets branch name</label>
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
      <div class="mb-4">
        <label for="project-tickets-root" class="mb-2 block text-sm font-medium">Tickets folder</label>
        <div class="flex gap-2">
          <input
            id="project-tickets-root"
            type="text"
            value={s.ticketsRootPath()}
            onInput={(e) => s.setTicketsRootPath(e.currentTarget.value)}
            placeholder="Defaults to the project data directory"
            class="input"
            data-testid="add-project-tickets-root-input"
          />
          <button
            type="button"
            onClick={s.handleBrowseTicketsRoot}
            class="btn-secondary"
            data-testid="add-project-tickets-browse"
          >Browse</button>
        </div>
      </div>
      <div class="mb-4">
        <label for="project-worktree-root" class="mb-2 block text-sm font-medium">Agent worktree root path</label>
        <div class="flex gap-2">
          <input
            id="project-worktree-root"
            type="text"
            value={s.worktreeRootPath()}
            onInput={(e) => s.setWorktreeRootPath(e.currentTarget.value)}
            placeholder="Defaults to the project data directory"
            class="input"
            data-testid="add-project-worktree-root-input"
          />
          <button
            type="button"
            onClick={s.handleBrowseWorktreeRoot}
            class="btn-secondary"
            data-testid="add-project-worktree-browse"
          >Browse</button>
        </div>
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
