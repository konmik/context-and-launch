import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { Page } from 'playwright'

const directory = process.env.TEST_ACTION_TRACE_DIR
const traces = new WeakMap<Page, string>()

export async function timeAction<T>(action: string, run: () => T | Promise<T>): Promise<T> {
  if (!directory) return run()
  const started = performance.now()
  try {
    return await run()
  } finally {
    fs.mkdirSync(directory, {
      recursive: true,
    })
    fs.appendFileSync(
      path.join(directory, `${process.pid}-actions.jsonl`),
      JSON.stringify({
        test: expect.getState().currentTestName,
        action,
        durationMs: performance.now() - started,
      }) + '\n',
    )
  }
}

export async function startActionTrace(page: Page): Promise<void> {
  if (!directory) return
  fs.mkdirSync(directory, {
    recursive: true,
  })
  const tracePath = path.join(directory, `${process.pid}-${randomUUID()}.zip`)
  await page.context().tracing.start({
    title: expect.getState().currentTestName,
    screenshots: false,
    snapshots: false,
    sources: false,
  })
  traces.set(page, tracePath)
}

export async function closeTimedPage(page: Page): Promise<void> {
  const tracePath = traces.get(page)
  try {
    if (tracePath)
      await page.context().tracing.stop({
        path: tracePath,
      })
  } finally {
    await timeAction('browser.context.close', () => page.context().close())
  }
}
