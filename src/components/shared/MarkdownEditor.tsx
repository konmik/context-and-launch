import { onMount, onCleanup, createEffect } from "solid-js";
import {
  EditorView, ViewPlugin, Decoration, type DecorationSet,
  keymap, placeholder as cmPlaceholder,
} from "@codemirror/view";
import { EditorState, Compartment, type Range } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting, defaultHighlightStyle, HighlightStyle,
  bracketMatching, syntaxTree,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";

const MONO_FONT = "var(--font-mono)";

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
    caretColor: "var(--primary)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary)",
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
    color: "var(--muted-foreground)",
    fontFamily: MONO_FONT,
  },
});

const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontFamily: MONO_FONT, fontSize: "1.6em", fontWeight: "700", color: "var(--primary)" },
  { tag: tags.heading2, fontFamily: MONO_FONT, fontSize: "1.4em", fontWeight: "700", color: "var(--primary)" },
  { tag: tags.heading3, fontFamily: MONO_FONT, fontSize: "1.2em", fontWeight: "700", color: "var(--primary)" },
  { tag: tags.heading4, fontFamily: MONO_FONT, fontSize: "1.1em", fontWeight: "700", color: "var(--primary)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.monospace,
    fontFamily: MONO_FONT,
    color: "var(--muted-foreground)",
    backgroundColor: "var(--muted)", borderRadius: "3px", padding: "1px 3px",
  },
  { tag: tags.link, color: "var(--ring)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--ring)" },
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
    update(update: { docChanged: boolean; view: EditorView }) {
      if (update.docChanged)
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
  readOnly?: boolean;
  plain?: boolean;
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let lastPushedValue: string | null = null;
  const readOnlyCompartment = new Compartment();

  onMount(() => {
    const saveKeymap = props.onSave
      ? [
          { key: "Mod-s", run: () => { props.onSave!(); return true; } },
          { key: "Mod-Enter", run: () => { props.onSave!(); return true; } },
        ]
      : [];

    const extensions = [
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
        ...(props.plain ? [] : [
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          syntaxHighlighting(markdownStyle),
          markdown({ codeLanguages: languages }),
          codeBlockPlugin,
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: props.plain ? "false" : "true" }),
        theme,
        cmPlaceholder(props.placeholder ?? ""),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            lastPushedValue = update.state.doc.toString();
            props.onChange(lastPushedValue);
          }
        }),
        readOnlyCompartment.of([
          EditorState.readOnly.of(!!props.readOnly),
          EditorView.editable.of(!props.readOnly),
        ]),
    ];

    const state = EditorState.create({
      doc: props.value,
      extensions,
    });

    view = new EditorView({ state, parent: containerRef! });
  });

  createEffect(() => {
    if (!view) return;
    const ro = !!props.readOnly;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(ro),
        EditorView.editable.of(!ro),
      ]),
    });
  });

  createEffect(() => {
    const val = props.value;
    if (val === lastPushedValue) {
      lastPushedValue = null;
      return;
    }
    lastPushedValue = null;
    if (view) {
      const oldText = view.state.doc.toString();
      if (oldText !== val) {
        let prefixLen = 0;
        const minLen = Math.min(oldText.length, val.length);
        while (prefixLen < minLen && oldText.charCodeAt(prefixLen) === val.charCodeAt(prefixLen))
          prefixLen++;
        let oldEnd = oldText.length;
        let newEnd = val.length;
        while (
          oldEnd > prefixLen && newEnd > prefixLen
          && oldText.charCodeAt(oldEnd - 1) === val.charCodeAt(newEnd - 1)
        ) {
          oldEnd--;
          newEnd--;
        }
        view.dispatch({
          changes: { from: prefixLen, to: oldEnd, insert: val.slice(prefixLen, newEnd) },
        });
      }
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
