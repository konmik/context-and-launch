import { FileToolbar, EditorPane, TAB_PANE_CLASS } from "./ticket-detail-parts.js";
import { activeFileLabel, isReadOnly } from "./ticket-detail-pure.js";
import type { TicketDetailState } from "./ticket-detail-state.js";

export function EditorTab(props: { ctrl: TicketDetailState }) {
  const s = props.ctrl;
  return (
    <>
      <FileToolbar
        activeFile={s.activeFile()}
        options={s.allFileOptions()}
        isStale={s.isReferenceStale}
        dropdownOpen={s.dropdownOpen()}
        setDropdownOpen={s.setDropdownOpen}
        onSelect={s.selectFile}
        onTrash={s.handleTrashClick}
        onNewFile={s.openNewFileDialog}
        onBrowse={s.openNativeFileBrowser}
        browsing={s.browsing()}
        uploading={s.uploading()}
        dragging={s.dragging()}
        onDragOver={s.handleDragOver}
        onDragLeave={s.handleDragLeave}
        onDrop={s.handleDrop}
        onFileInputChange={s.handleFileInputChange}
      />
      <div class={TAB_PANE_CLASS}>
        <EditorPane
          viewMode={s.fileViewMode()}
          content={s.content()}
          onChange={s.setContent}
          onSave={s.activeFile().type === "context" ? s.saveFile : undefined}
          readOnly={isReadOnly(s.activeFile())}
          imageUrl={s.imageUrl()}
          label={activeFileLabel(s.activeFile())}
        />
      </div>
    </>
  );
}
