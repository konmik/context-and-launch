import type { Locator, Page } from "playwright";

/**
 * How long a locator wait may run before it fails. The suite's own limit is the
 * vitest testTimeout; this one exists only so a broken test reports the element
 * it was waiting for instead of hanging until the suite gives up.
 */
export const WAIT_TIMEOUT_MS = 15_000;

/** Extra attributes narrowing a test id, e.g. `{ "data-column-name": "todo" }`. */
export type TestIdAttributes = Record<string, string>;

function testIdSelector(id: string, attrs: TestIdAttributes = {}): string {
  const extra = Object.entries(attrs).map(([name, value]) => `[${name}="${value}"]`).join("");
  return `[data-testid="${id}"]${extra}`;
}

/** Anything a test id can be looked up under: the page, or an enclosing element. */
type LocatorRoot = Pick<Page, "locator">;

export function testId(root: LocatorRoot, id: string, attrs: TestIdAttributes = {}): Locator {
  return root.locator(testIdSelector(id, attrs));
}

/**
 * These waits are about a testid appearing or going away, not about it being
 * unique, so they resolve against the first match. A locator that matched
 * several elements would otherwise fail Playwright's strict mode, which would
 * make a shared testid such as a board column header unusable as a wait target.
 */
async function waitForState(
  page: Page, id: string, attrs: TestIdAttributes, state: "visible" | "detached" | "hidden",
): Promise<Locator> {
  const locator = testId(page, id, attrs);
  await locator.first().waitFor({ state, timeout: WAIT_TIMEOUT_MS });
  return locator;
}

export function waitVisible(
  page: Page, id: string, attrs: TestIdAttributes = {},
): Promise<Locator> {
  return waitForState(page, id, attrs, "visible");
}

export async function waitGone(
  page: Page, id: string, attrs: TestIdAttributes = {},
): Promise<void> {
  await waitForState(page, id, attrs, "detached");
}

export async function waitHidden(
  page: Page, id: string, attrs: TestIdAttributes = {},
): Promise<void> {
  await waitForState(page, id, attrs, "hidden");
}

export function countOf(
  page: Page, id: string, attrs: TestIdAttributes = {},
): Promise<number> {
  return testId(page, id, attrs).count();
}

/** Waits for whichever of the given test ids shows first. */
export async function waitVisibleAny(page: Page, ids: string[]): Promise<void> {
  await page.locator(ids.map((id) => testIdSelector(id)).join(", ")).first()
    .waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
}
