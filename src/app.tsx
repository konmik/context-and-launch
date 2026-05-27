import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount, onCleanup } from "solid-js";
import { initRipple } from "./lib/ripple";
import "./app.css";

export default function App() {
  onMount(() => onCleanup(initRipple()));

  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <FileRoutes />
    </Router>
  );
}
