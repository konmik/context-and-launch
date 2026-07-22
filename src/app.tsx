import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { ErrorBoundary, Suspense, onMount, onCleanup } from "solid-js";
import { initRipple } from "./lib/ripple";
import "./app.css";

export default function App() {
  onMount(() => onCleanup(initRipple()));

  return (
    <Router root={(props) => (
      <ErrorBoundary fallback={(error, reset) => (
        <div
          class="mx-auto mt-10 max-w-2xl rounded-lg border border-destructive/40 bg-card p-6 shadow-sm"
          role="alert"
        >
          <h2 class="mb-2 text-lg font-semibold">Something went wrong</h2>
          <p class="mb-4 whitespace-pre-wrap text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <button class="btn-primary" onClick={reset}>Retry</button>
        </div>
      )}>
        <Suspense>{props.children}</Suspense>
      </ErrorBoundary>
    )}>
      <FileRoutes />
    </Router>
  );
}
