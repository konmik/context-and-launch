import { createAsync } from "@solidjs/router";
import type { Accessor } from "solid-js";

// Reading a createAsync accessor registers the read with the nearest Suspense
// boundary whenever a fetch is in flight, including refetches after
// revalidate(), which collapses that boundary to its fallback. The app's only
// boundary is the root one in app.tsx, so a plain createAsync read anywhere
// blanks the whole screen. This wrapper reads `latest` instead, which never
// registers with Suspense once the resource has a value; passing the
// initialValue property (even when undefined) marks the resource resolved from
// creation, so the very first fetch does not suspend either. Loading states
// are rendered explicitly by consumers (Show fallbacks, initial values).
export function createNonSuspendingAsync<T>(
  fn: () => Promise<T>,
  options: { initialValue: T },
): Accessor<T>;
export function createNonSuspendingAsync<T>(fn: () => Promise<T>): Accessor<T | undefined>;
export function createNonSuspendingAsync<T>(
  fn: () => Promise<T>,
  options?: { initialValue?: T },
): Accessor<T | undefined> {
  const data = createAsync(fn, { initialValue: options?.initialValue as T });
  return () => data.latest;
}
