import { Show } from "solid-js";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { DialogRoot, DialogTitle } from "../ui/dialog";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  createCreateTicketController,
  type CreateTicketController,
} from "./create-ticket-controller.js";
import { suggestTicketNumber } from "./ticket-api.js";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (number: string, title: string) => Promise<{ error?: string }>;
  suggestedNextNumber?: string | null;
  projectSlug: string;
  ctrl?: CreateTicketController;
}

export default function CreateTicketDialog(props: CreateTicketDialogProps) {
  const s = props.ctrl ?? createCreateTicketController({
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
    suggestedNextNumber: () => props.suggestedNextNumber,
    open: () => props.open,
    onSuggestNumber: (numberInput: string) => suggestTicketNumber(props.projectSlug, numberInput),
  });

  useModEnterSubmit({
    onSubmit: s.doSubmit,
    disabled: () => s.submitting() || s.suggestingNumber() || !s.number().trim() || !s.title().trim(),
    active: () => props.open,
  });

  return (
    <DialogRoot open={props.open} onOpenChange={s.close}>
      <DialogTitle>New Ticket</DialogTitle>
      <form onSubmit={(e) => { e.preventDefault(); s.doSubmit(); }}>
        <div class="mb-4">
          <label for="ticket-number" class="field-label">Number</label>
          <div class="flex gap-2">
            <input
              id="ticket-number"
              type="text"
              value={s.number()}
              onInput={(e) => s.setNumber(e.currentTarget.value)}
              class="input flex-1"
              placeholder="e.g. ABC-1"
              data-testid="create-ticket-number-input"
            />
            <button
              type="button"
              class="btn-icon shrink-0"
              title="Regenerate number"
              disabled={s.suggestingNumber()}
              onClick={s.suggestNumber}
              data-testid="create-ticket-regenerate-button"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div class="mb-4">
          <label for="ticket-title" class="field-label">Title</label>
          <input
            id="ticket-title"
            type="text"
            value={s.title()}
            onInput={(e) => s.setTitle(e.currentTarget.value)}
            class="input"
            placeholder="e.g. Fix login timeout"
            data-testid="create-ticket-title-input"
          />
        </div>
        <Show when={s.errorMsg()}><p class="mb-4 text-sm text-destructive">{s.errorMsg()}</p></Show>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={s.close}
            class="btn-secondary"
            data-testid="create-ticket-cancel"
          >Cancel</button>
          <button
            type="submit"
            disabled={s.submitting() || s.suggestingNumber() || !s.number().trim() || !s.title().trim()}
            title={modEnterHint()}
            class="btn-primary"
            data-testid="create-ticket-submit"
          >Create</button>
        </div>
      </form>
    </DialogRoot>
  );
}
