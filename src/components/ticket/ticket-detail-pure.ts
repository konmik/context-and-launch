export type ActiveFile =
  | { type: "context"; name: string }
  | { type: "file"; name: string }
  | { type: "reference"; path: string };

export type FileView =
  | { kind: "loading" }
  | { kind: "editor" }
  | { kind: "image"; url: string }
  | { kind: "unsupported" };

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md"]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isImage(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name));
}

export function isText(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name));
}

export function activeFileLabel(af: ActiveFile): string {
  switch (af.type) {
    case "context": return `${af.name}.md`;
    case "file": return af.name;
    case "reference": {
      const sep = af.path.includes("\\") ? "\\" : "/";
      const parts = af.path.split(sep);
      return parts[parts.length - 1] || af.path;
    }
  }
}

export function isActiveFileMatch(a: ActiveFile, b: ActiveFile): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "reference" && b.type === "reference") return a.path === b.path;
  if (a.type === "context" && b.type === "context") return a.name === b.name;
  if (a.type === "file" && b.type === "file") return a.name === b.name;
  return false;
}

export function buildContextOptions(
  defaultNames: string[],
  existingNames: string[],
  extraFileNames: string[],
): ActiveFile[] {
  const all = [...defaultNames];
  for (const name of [...existingNames, ...extraFileNames]) {
    if (!all.includes(name)) all.push(name);
  }
  return all.map((name) => ({ type: "context" as const, name }));
}

export function buildFileEntryOptions(fileNames: string[]): ActiveFile[] {
  return fileNames
    .filter((n) => !n.endsWith(".md") && n !== "status.json")
    .map((name) => ({ type: "file" as const, name }));
}

export function buildReferenceOptions(
  references: { path: string; exists: boolean }[],
): ActiveFile[] {
  return references.map(
    (ref) => ({ type: "reference" as const, path: ref.path }),
  );
}

export function buildAllFileOptions(
  contextOpts: ActiveFile[],
  fileOpts: ActiveFile[],
  refOpts: ActiveFile[],
): ActiveFile[] {
  return [...contextOpts, ...fileOpts, ...refOpts];
}

export function isReadOnly(activeFile: ActiveFile): boolean {
  return activeFile.type === "reference" || activeFile.type === "file";
}

export function checkReferenceStale(
  references: { path: string; exists: boolean }[],
  refPath: string,
): boolean {
  const ref = references.find((r) => r.path === refPath);
  return ref ? !ref.exists : false;
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function hasUnsavedEditorChanges(
  activeTab: string,
  fileViewKind: FileView["kind"],
  readOnly: boolean,
  content: string,
  savedContent: string,
): boolean {
  return (
    activeTab === "editor"
    && fileViewKind === "editor"
    && !readOnly
    && content !== savedContent
  );
}

export function slugifyFileName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function wouldOverwrite(
  fileName: string,
  existingFileNames: string[],
  existingContextNames: string[],
): boolean {
  const allExisting = [
    ...existingFileNames,
    ...existingContextNames.map((s) => `${s}.md`),
  ];
  return allExisting.includes(fileName);
}

export function ticketApiUrl(
  projectSlug: string,
  folderName: string,
  suffix: string,
): string {
  return `/api/projects/${projectSlug}/board/tickets/${folderName}/${suffix}`;
}

export function resolveFileViewMode(
  fileName: string,
): "editor" | "image" | "unsupported" {
  if (isImage(fileName)) return "image";
  if (isText(fileName)) return "editor";
  return "unsupported";
}

export function showSaveButton(
  activeTab: string,
  activeFileType: string,
): boolean {
  return activeTab === "editor" && activeFileType === "context";
}
