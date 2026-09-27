import type { JSX } from '@solidjs/web'
import { ErrorField } from '../shared/ErrorField.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { createAddProjectController } from './add-project-controller.js'
import BoardSelector from './BoardSelector.js'
import type { AddProjectFormProps } from './AddProjectForm.js'

export function AddProjectFormContent(props: AddProjectFormProps): JSX.Element {
  const errors = useErrorReporter()
  const s =
    props.ctrl ??
    createAddProjectController({
      action: props.action,
      onSuccess: props.onSuccess,
      onError: errors.report,
      onClearError: errors.clear,
    })
  return (
    <form onSubmit={s.handleSubmit}>
      <div class="mb-4">
        <label for="project-name" class="field-label">
          Project name
        </label>
        <input
          id="project-name"
          type="text"
          value={s.nameValue()}
          onInput={(e) => s.setNameValue(e.currentTarget.value)}
          placeholder="Optional display name"
          class="input"
          data-testid="add-project-name-input"
        />
        <ErrorField field="name" />
      </div>
      <div class="mb-4">
        <label for="project-path" class="field-label">
          Git Repository Path
        </label>
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
          <button type="button" onClick={s.handleBrowsePath} class="btn-secondary" data-testid="add-project-path-browse">
            Browse
          </button>
        </div>
        <ErrorField field="path" />
      </div>
      <BoardSelector boardId={s.boardId()} setBoardId={s.setBoardId} />
      <div class="mb-4">
        <label for="project-main-branch" class="field-label">
          Main branch
        </label>
        <input
          id="project-main-branch"
          type="text"
          value={s.mainBranchValue()}
          onInput={(e) => s.setMainBranchValue(e.currentTarget.value)}
          placeholder="Auto-detected from repository"
          class="input"
          data-testid="add-project-main-branch-input"
        />
        <ErrorField field="mainBranch" />
      </div>
      <div class="mb-4">
        <label for="project-branch" class="field-label">
          Tickets branch name
        </label>
        <input
          id="project-branch"
          type="text"
          value={s.branchValue()}
          onInput={(e) => s.setBranchValue(e.currentTarget.value)}
          placeholder="tickets"
          class="input"
          data-testid="add-project-branch-input"
        />
        <ErrorField field="branch" />
      </div>
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
  )
}
