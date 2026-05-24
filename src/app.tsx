import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount } from "solid-js";
import "./app.css";

function initRipple() {
  document.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest(
      "button, [role='button'], [data-ripple], .ripple"
    ) as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const hasOverflow = getComputedStyle(target).overflow === "hidden";
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    if (hasOverflow) {
      target.appendChild(ripple);
    } else {
      const wrapper = document.createElement("span");
      wrapper.className = "ripple-container";
      wrapper.appendChild(ripple);
      target.appendChild(wrapper);
      ripple.addEventListener("animationend", () => wrapper.remove());
      return;
    }
    ripple.addEventListener("animationend", () => ripple.remove());
  });
}

export default function App() {
  onMount(initRipple);

  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
