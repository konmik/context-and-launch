import { render as renderSolid } from "@solidjs/web";
import { getQueriesForElement, screen, fireEvent, waitFor } from "@testing-library/dom";
import type { Element } from "solid-js";

const disposers: (() => void)[] = [];

export function render(view: () => Element) {
  const container = document.body.appendChild(document.createElement("div"));
  const dispose = renderSolid(view, container);
  disposers.push(() => { dispose(); container.remove(); });
  return { container, unmount: dispose, ...getQueriesForElement(container) };
}

export function cleanup() {
  for (const dispose of disposers.splice(0)) dispose();
}

export { fireEvent, screen, waitFor };
