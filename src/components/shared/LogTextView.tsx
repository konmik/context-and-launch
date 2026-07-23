import { createEffect, onCleanup, onMount } from "solid-js";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { searchKeymap } from "@codemirror/search";

const FOLLOW_TAIL_THRESHOLD = 40;

const logTheme = EditorView.theme({
	"&": {
		height: "100%",
		backgroundColor: "var(--background)",
		color: "var(--foreground)",
		fontSize: "0.75rem",
	},
	"&.cm-focused": {
		outline: "none",
	},
	".cm-scroller": {
		overflow: "auto",
		fontFamily: "var(--font-mono)",
		lineHeight: "1.625",
	},
	".cm-content": {
		padding: "0.75rem",
		caretColor: "var(--foreground)",
	},
	".cm-line": {
		padding: "0",
	},
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
		backgroundColor: "var(--accent)",
	},
});

function findTextChange(previous: string, next: string) {
	let from = 0;
	const sharedLength = Math.min(previous.length, next.length);
	while (
		from < sharedLength
		&& previous.charCodeAt(from) === next.charCodeAt(from)
	) {
		from += 1;
	}

	let previousEnd = previous.length;
	let nextEnd = next.length;
	while (
		previousEnd > from
		&& nextEnd > from
		&& previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)
	) {
		previousEnd -= 1;
		nextEnd -= 1;
	}

	return {
		from,
		to: previousEnd,
		insert: next.slice(from, nextEnd),
	};
}

export default function LogTextView(props: { text: string }) {
	let containerRef: HTMLDivElement | undefined;
	let view: EditorView | undefined;
	let renderedText = props.text;
	let initialScrollFrame: number | undefined;

	const scrollToBottom = () => {
		if (!view) return;
		view.dispatch({
			effects: EditorView.scrollIntoView(view.state.doc.length, { y: "end" }),
		});
	};

	onMount(() => {
		const state = EditorState.create({
			doc: renderedText,
			extensions: [
				keymap.of(searchKeymap),
				EditorState.readOnly.of(true),
				EditorView.editable.of(false),
				EditorView.contentAttributes.of({
					"aria-label": "Application logs",
					spellcheck: "false",
					tabindex: "0",
				}),
				logTheme,
			],
		});
		view = new EditorView({ state, parent: containerRef! });
		initialScrollFrame = requestAnimationFrame(scrollToBottom);
	});

	createEffect(() => {
		const nextText = props.text;
		if (!view || nextText === renderedText) return;
		const { scrollDOM } = view;
		const shouldFollowTail = (
			scrollDOM.scrollHeight - scrollDOM.scrollTop - scrollDOM.clientHeight
		) < FOLLOW_TAIL_THRESHOLD;
		const change = findTextChange(renderedText, nextText);
		renderedText = nextText;
		view.dispatch({ changes: change });
		if (shouldFollowTail) scrollToBottom();
	});

	onCleanup(() => {
		if (initialScrollFrame !== undefined) {
			cancelAnimationFrame(initialScrollFrame);
		}
		view?.destroy();
		view = undefined;
	});

	return (
		<div
			ref={(element) => (containerRef = element)}
			class={
				"min-h-0 flex-1 overflow-hidden rounded-md"
				+ " border border-border bg-background"
			}
		/>
	);
}
