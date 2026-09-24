import { createContext } from "solid-js";
import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";
import type { StoredSignal } from "~/util/stored-signal.js";

export const DiffReviewContext = createContext<StoredSignal<DiffReviewProjectState>>();
