import {
	Show,
	createEffect,
	createSignal,
	untrack,
	type JSX,
} from "solid-js";

type RevealPhase = "entering" | "visible" | "leaving";

export default function VerticalReveal(props: {
	show: boolean;
	class?: string;
	children: JSX.Element;
	onHidden?(): void;
}) {
	const [mounted, setMounted] = createSignal(false);
	const [phase, setPhase] = createSignal<RevealPhase>("visible");
	const prefersReducedMotion = () =>
		typeof window !== "undefined"
		&& typeof window.matchMedia === "function"
		&& window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	function hide() {
		setMounted(false);
		setPhase("visible");
		props.onHidden?.();
	}

	createEffect(() => {
		const show = props.show;
		const currentPhase = untrack(phase);
		if (show) {
			const wasMounted = untrack(mounted);
			if (!wasMounted) setMounted(true);
			if (currentPhase !== "visible" || !wasMounted) {
				setPhase(prefersReducedMotion() ? "visible" : "entering");
			}
			return;
		}
		if (!untrack(mounted)) return;
		if (prefersReducedMotion()) hide();
		else setPhase("leaving");
	});

	function onRevealEnd(event: AnimationEvent) {
		if (event.target !== event.currentTarget) return;
		if (event.animationName === "vertical-reveal-open" && phase() === "entering") {
			setPhase("visible");
		} else if (event.animationName === "vertical-reveal-close" && phase() === "leaving") {
			hide();
		}
	}

	return (
		<Show when={mounted()}>
			<div
				class={`${props.class ?? ""} vertical-reveal-body`}
				classList={{
					"vertical-reveal-enter": phase() === "entering",
					"vertical-reveal-leave": phase() === "leaving",
				}}
				onAnimationEnd={onRevealEnd}
			>
				<div>{props.children}</div>
			</div>
		</Show>
	);
}
