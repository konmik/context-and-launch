import { createSignal } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { ActiveFile } from "./ticket-detail-pure.js";
import { wouldOverwrite } from "./ticket-detail-pure.js";

export interface FileUploadDeps {
  ticketUrl: (suffix: string) => string;
  setError: (msg: string) => void;
  ticketFileNames: () => string[];
  setTicketFileNames: (fn: string[] | ((prev: string[]) => string[])) => void;
  contextNames: string[];
  requestFileSwitch: (file: ActiveFile) => void;
}

export function createFileUploadState(deps: FileUploadDeps) {
  const [uploading, setUploading] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [confirmOverwrite, setConfirmOverwrite] = createSignal<{ fileName: string; file: File } | null>(null);
  const [confirmSize, setConfirmSize] = createSignal<{ fileName: string; file: File; size: number } | null>(null);
  let resolveUploadConfirm: ((confirmed: boolean) => void) | null = null;

  function handleDragOver(e: DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragging(true);
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) await processFileForUpload(files[i]);
  }

  async function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) await processFileForUpload(files[i]);
    input.value = "";
  }

  function awaitUploadConfirm<T>(setter: (v: T) => void, value: T): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      resolveUploadConfirm = resolve;
      setter(value);
    });
  }

  async function processFileForUpload(file: File) {
    if (file.name === "status.json") { deps.setError("Cannot overwrite status.json"); return; }
    if (file.size > 10240) {
      const proceed = await awaitUploadConfirm(setConfirmSize, { fileName: file.name, file, size: file.size });
      setConfirmSize(null);
      if (!proceed) return;
    }
    if (wouldOverwrite(file.name, deps.ticketFileNames(), deps.contextNames)) {
      const proceed = await awaitUploadConfirm(setConfirmOverwrite, { fileName: file.name, file });
      setConfirmOverwrite(null);
      if (!proceed) return;
    }
    await uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true); deps.setError("");
    try {
      const formData = new FormData(); formData.append("file", file);
      const res = await fetch(deps.ticketUrl("files/upload"), { method: "POST", body: formData });
      if (!res.ok) { deps.setError(await res.text() || "Upload failed"); return; }
      const data = await res.json();
      for (const result of data.results) {
        if (result.ok) {
          deps.setTicketFileNames((prev) =>
            prev.includes(result.name) ? prev : [...prev, result.name].sort(),
          );
        }
        else { deps.setError(result.error || `Failed to upload ${result.name}`); }
      }
      revalidate("project-page");
      if (file.name.endsWith(".md")) deps.requestFileSwitch({ type: "context", name: file.name.replace(/\.md$/, "") });
      else deps.requestFileSwitch({ type: "file", name: file.name });
    } catch (e) { deps.setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  }

  function confirmUpload() {
    resolveUploadConfirm?.(true); resolveUploadConfirm = null;
  }
  function cancelUpload() {
    resolveUploadConfirm?.(false); resolveUploadConfirm = null;
  }

  return {
    uploading, dragging, confirmOverwrite, confirmSize,
    handleDragOver, handleDragLeave, handleDrop, handleFileInputChange,
    confirmSizeAndUpload: confirmUpload, confirmOverwriteAndUpload: confirmUpload,
    cancelSizeConfirm: cancelUpload, cancelOverwriteConfirm: cancelUpload,
  };
}
