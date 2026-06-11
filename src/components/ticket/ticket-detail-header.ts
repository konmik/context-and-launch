import { createSignal } from "solid-js";
import { updateTicket } from "./ticket-api.js";

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
    const numberToSave = trimmedNumber && trimmedNumber !== savedNumber() ? trimmedNumber : null;
    const titleToSave = trimmedTitle && trimmedTitle !== savedTitle() ? trimmedTitle : null;
    if (!numberToSave && !titleToSave) return;
    const result = await updateTicket(
      deps.projectSlug, savedFolderName(), numberToSave, titleToSave, null,
    );
    if (!result.ok) { deps.setError(result.message); return; }
    if (numberToSave) setSavedNumber(numberToSave);
    if (titleToSave) setSavedTitle(titleToSave);
    if (result.folderName) setSavedFolderName(result.folderName);
  }

  return {
    editedNumber, setEditedNumber, editedTitle, setEditedTitle,
    savedNumber, savedTitle, savedFolderName,
    hasUnsavedHeaderChanges, saveTicketHeader,
  };
}
