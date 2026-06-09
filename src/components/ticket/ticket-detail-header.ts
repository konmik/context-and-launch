import { createSignal } from "solid-js";
import { apiFetch } from "~/lib/api.js";

export interface HeaderEditDeps {
  projectSlug: string;
  ticket: { number: string; title: string; folderName: string };
  setError: (msg: string) => void;
}

export function createHeaderEditState(deps: HeaderEditDeps) {
  const [editedNumber, setEditedNumber] = createSignal(deps.ticket.number);
  const [editedTitle, setEditedTitle] = createSignal(deps.ticket.title);
  const [savedNumber, setSavedNumber] = createSignal(deps.ticket.number);
  const [savedTitle, setSavedTitle] = createSignal(deps.ticket.title);
  const [savedFolderName, setSavedFolderName] = createSignal(deps.ticket.folderName);

  const hasUnsavedHeaderChanges = () =>
    editedNumber().trim() !== savedNumber()
    || editedTitle().trim() !== savedTitle();

  async function saveTicketHeader() {
    const trimmedNumber = editedNumber().trim();
    const trimmedTitle = editedTitle().trim();
    if (!trimmedNumber) setEditedNumber(savedNumber());
    if (!trimmedTitle) setEditedTitle(savedTitle());
    const body: Record<string, string> = {};
    if (trimmedNumber && trimmedNumber !== savedNumber()) body.number = trimmedNumber;
    if (trimmedTitle && trimmedTitle !== savedTitle()) body.title = trimmedTitle;
    if (Object.keys(body).length === 0) return;
    const result = await apiFetch(
      `/api/projects/${deps.projectSlug}/board/tickets/${savedFolderName()}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (result.error) { deps.setError(result.error); return; }
    if (body.number) setSavedNumber(body.number);
    if (body.title) setSavedTitle(body.title);
    if (result.folderName) setSavedFolderName(result.folderName as string);
  }

  return {
    editedNumber, setEditedNumber, editedTitle, setEditedTitle,
    savedNumber, savedTitle, savedFolderName,
    hasUnsavedHeaderChanges, saveTicketHeader,
  };
}
