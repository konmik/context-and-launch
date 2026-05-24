import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, ViewPlugin, Decoration, type DecorationSet, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState, type Range } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle, bracketMatching, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.875rem",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "0.75rem",
    caretColor: "var(--foreground)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--accent)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    borderRight: "none",
  },
  ".cm-line": {
    padding: "0 0",
  },
  ".cm-placeholder": {
    color: "var(--muted-foreground)",
  },
  ".cm-codeblock": {
    backgroundColor: "var(--muted)",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
});

const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.4em", fontWeight: "700" },
  { tag: tags.heading3, fontSize: "1.2em", fontWeight: "600" },
  { tag: tags.heading4, fontSize: "1.1em", fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', ui-monospace, monospace", backgroundColor: "var(--muted)", borderRadius: "3px", padding: "1px 3px" },
  { tag: tags.link, color: "oklch(0.55 0.15 250)", textDecoration: "underline" },
  { tag: tags.url, color: "oklch(0.55 0.15 250)" },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--muted-foreground)" },
  { tag: tags.processingInstruction, fontWeight: "700", color: "var(--muted-foreground)" },
]);

const codeBlockDeco = Decoration.line({ class: "cm-codeblock" });

function buildCodeBlockDecos(view: EditorView) {
  const decos: Range<Decoration>[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === "FencedCode") {
        for (let pos = node.from; pos <= node.to;) {
          const line = view.state.doc.lineAt(pos);
          decos.push(codeBlockDeco.range(line.from));
          pos = line.to + 1;
        }
      }
    },
  });
  return Decoration.set(decos, true);
}

const codeBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCodeBlockDecos(view);
    }
    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged)
        this.decorations = buildCodeBlockDecos(update.view);
    }
  },
  { decorations: (v) => v.decorations },
);

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  placeholder?: string;
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let lastPushedValue: string | null = null;

  onMount(() => {
    const saveKeymap = props.onSave
      ? [{ key: "Mod-s", run: () => { props.onSave!(); return true; } }]
      : [];

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        keymap.of([
          ...saveKeymap,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
        ]),
        history(),
        closeBrackets(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        syntaxHighlighting(markdownStyle),
        markdown({ codeLanguages: languages }),
        codeBlockPlugin,
        EditorView.lineWrapping,
        theme,
        cmPlaceholder(props.placeholder ?? ""),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            lastPushedValue = update.state.doc.toString();
            props.onChange(lastPushedValue);
          }
        }),
      ],
    });

    view = new EditorView({ state, parent: containerRef! });
  });

  createEffect(() => {
    const val = props.value;
    if (val === lastPushedValue) {
      lastPushedValue = null;
      return;
    }
    lastPushedValue = null;
    if (view && view.state.doc.toString() !== val) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: val },
      });
    }
  });

  onCleanup(() => {
    view?.destroy();
  });

  return (
    <div
      ref={(el) => (containerRef = el)}
      class="h-full w-full overflow-hidden rounded-md border border-input bg-background"
    />
  );
}
