import { FileToolbar, EditorPane, TAB_PANE_CLASS } from "./ticket-detail-parts.js";
import { activeFileLabel, type ActiveFile } from "./ticket-detail-pure.js";

export function EditorTab(props: {
  activeFile: ActiveFile;
  options: ActiveFile[];
  isStale: (path: string) => boolean;
  dropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  onSelect: (af: ActiveFile) => void;
  onTrash: () => void;
  onNewFile: () => void;
  onBrowse: () => void;
  browsing: boolean;
  uploading: boolean;
  dragging: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onFileInputChange: (e: Event) => void;
  viewMode: "editor" | "image" | "unsupported";
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  imageUrl: string;
}) {
  const readOnly = () => props.activeFile.type === "reference" || props.activeFile.type === "file";
  return (
    <>
      <FileToolbar
        activeFile={props.activeFile}
        options={props.options}
        isStale={props.isStale}
        dropdownOpen={props.dropdownOpen}
        setDropdownOpen={props.setDropdownOpen}
        onSelect={props.onSelect}
        onTrash={props.onTrash}
        onNewFile={props.onNewFile}
        onBrowse={props.onBrowse}
        browsing={props.browsing}
        uploading={props.uploading}
        dragging={props.dragging}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onDrop={props.onDrop}
        onFileInputChange={props.onFileInputChange}
      />
      <div class={TAB_PANE_CLASS}>
        <EditorPane
          viewMode={props.viewMode}
          content={props.content}
          onChange={props.onChange}
          onSave={props.activeFile.type === "context" ? props.onSave : undefined}
          readOnly={readOnly()}
          imageUrl={props.imageUrl}
          label={activeFileLabel(props.activeFile)}
        />
      </div>
    </>
  );
}
