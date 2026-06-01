import { Show } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  createDeleteProjectController,
  type DeleteProjectController,
} from "./delete-project-controller.js";

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  onSubmit: (projectSlug: string) => Promise<{ error?: string }>;
  ctrl?: DeleteProjectController;
}

export default function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  const s = props.ctrl ?? createDeleteProjectController({
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
    projectSlug: () => props.projectSlug,
  });

  useModEnterSubmit({
    onSubmit: s.doSubmit,
    disabled: () => s.submitting(),
    active: () => props.open,
  });

  return (
    <DialogRoot open={props.open} onOpenChange={s.close}>
      <DialogTitle>Delete Project</DialogTitle>
      <DialogDescription>
        Remove project {props.projectSlug} from the launcher? This only removes it from
        the list; your files and git repository are left untouched.
      </DialogDescription>
      <Show when={s.errorMsg()}><p class="mb-4 text-sm text-destructive">{s.errorMsg()}</p></Show>
      <form onSubmit={(e) => { e.preventDefault(); s.doSubmit(); }}>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={s.close}
            class="btn-secondary"
            data-testid="delete-project-cancel"
          >Cancel</button>
          <button
            type="submit"
            disabled={s.submitting()}
            title={modEnterHint()}
            class="btn-destructive"
            data-testid="delete-project-submit"
          >Delete</button>
        </div>
      </form>
    </DialogRoot>
  );
}
