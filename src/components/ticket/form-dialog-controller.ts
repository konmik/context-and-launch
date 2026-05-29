import { createSignal } from "solid-js";

export interface FormDialogDeps<TSubmitArgs extends unknown[]> {
  onSubmit: (...args: TSubmitArgs) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
}

export function createFormDialogController<TSubmitArgs extends unknown[]>(
  deps: FormDialogDeps<TSubmitArgs>,
) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");

  function close() {
    deps.onOpenChange(false);
    setErrorMsg("");
  }

  async function doSubmit(...args: TSubmitArgs) {
    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await deps.onSubmit(...args);
      if (result?.error) setErrorMsg(result.error);
      else close();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, errorMsg, close, doSubmit, setErrorMsg };
}
