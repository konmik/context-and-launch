import { createFormDialogController } from "../ticket/form-dialog-controller.js";

export interface DeleteProjectDeps {
  onSubmit: (projectSlug: string) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  projectSlug: () => string;
}

export function createDeleteProjectController(deps: DeleteProjectDeps) {
  const form = createFormDialogController({
    onSubmit: deps.onSubmit,
    onOpenChange: deps.onOpenChange,
  });

  async function doSubmit() {
    await form.doSubmit(deps.projectSlug());
  }

  return {
    submitting: form.submitting, errorMsg: form.errorMsg,
    close: form.close, doSubmit,
  };
}

export type DeleteProjectController = ReturnType<typeof createDeleteProjectController>;
