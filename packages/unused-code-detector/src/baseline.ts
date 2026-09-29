import fs from 'node:fs'
import * as v from 'valibot'

export interface BaselineFinding {
  file: string
  symbol: string
  container: string[]
}

export interface BaselineEntry {
  file: string
  symbol: string
  count: number
  reason: string
}

export interface InspectionBaseline {
  entries: BaselineEntry[]
}

export interface InspectionComparison<T> {
  newFindings: T[]
  staleEntries: BaselineEntry[]
  suppressedCount: number
}

const reasonSchema = v.pipe(v.string(), v.trim(), v.nonEmpty())

const BaselineSchema = v.record(
  v.pipe(v.string(), v.nonEmpty()),
  v.record(
    v.pipe(v.string(), v.nonEmpty()),
    v.union([
      v.pipe(
        reasonSchema,
        v.transform((reason) => ({
          count: 1,
          reason,
        })),
      ),
      v.pipe(
        v.tuple([v.pipe(v.number(), v.integer(), v.minValue(2)), reasonSchema]),
        v.transform(([count, reason]) => ({
          count,
          reason,
        })),
      ),
    ]),
  ),
)

export function readInspectionBaseline(file: string): InspectionBaseline {
  const baseline = v.parse(BaselineSchema, JSON.parse(fs.readFileSync(file, 'utf8')))
  return {
    entries: Object.entries(baseline).flatMap(([file, symbols]) =>
      Object.entries(symbols).map(([symbol, entry]) => ({
        file,
        symbol,
        ...entry,
      })),
    ),
  }
}

export function compareInspectionBaseline<T extends BaselineFinding>(findings: T[], baseline: InspectionBaseline): InspectionComparison<T> {
  const remaining = new Map(baseline.entries.map((entry) => [JSON.stringify([entry.file, entry.symbol]), entry.count]))
  const newFindings: T[] = []
  for (const finding of findings) {
    const key = JSON.stringify([finding.file, [...finding.container, finding.symbol].join('.')])
    const count = remaining.get(key)
    if (count !== undefined && count > 0) remaining.set(key, count - 1)
    else newFindings.push(finding)
  }
  return {
    newFindings,
    staleEntries: baseline.entries.filter((entry) => remaining.get(JSON.stringify([entry.file, entry.symbol])) !== 0),
    suppressedCount: findings.length - newFindings.length,
  }
}
