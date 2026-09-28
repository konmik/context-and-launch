import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'
import * as v from 'valibot'

export const inspectionIds = ['JSUnusedGlobalSymbols', 'JSUnusedLocalSymbols', 'JSUnusedAssignment']

export interface InspectionFinding {
  id: string
  inspection: string
  file: string
  line: number
  symbol: string
  description: string
  source: string
}

const BaselineEntrySchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  file: v.string(),
  symbol: v.string(),
  count: v.pipe(v.number(), v.integer(), v.minValue(1)),
  reason: v.pipe(v.string(), v.trim(), v.minLength(20)),
})

const BaselineSchema = v.strictObject({
  version: v.literal(1),
  entries: v.array(BaselineEntrySchema),
})

export type InspectionBaseline = v.InferOutput<typeof BaselineSchema>

export interface InspectionComparison {
  newFindings: InspectionFinding[]
  staleEntries: InspectionBaseline['entries']
  suppressedCount: number
}

export function isTestFile(file: string): boolean {
  return /(^|\/)(tests|__tests__|__mocks__)\//.test(file) || /\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(file)
}

function readXml(file: string): Document {
  return new JSDOM(fs.readFileSync(file, 'utf8'), { contentType: 'text/xml' }).window.document
}

function requiredText(element: Element, selector: string): string {
  const value = element.querySelector(selector)?.textContent
  if (!value) throw new Error(`Missing ${selector} in inspection report`)
  return value
}

export function readInspectionFindings(directory: string, project: string): InspectionFinding[] {
  const descriptions = readXml(path.join(directory, '.descriptions.xml'))
  for (const id of inspectionIds) {
    if (descriptions.querySelector(`inspection[shortName="${id}"]`)?.getAttribute('enabled') !== 'true') {
      throw new Error(`Required inspection was not enabled: ${id}`)
    }
  }
  const findings = new Map<string, InspectionFinding>()
  for (const inspection of inspectionIds) {
    const reportPath = path.join(directory, `${inspection}.xml`)
    if (!fs.existsSync(reportPath)) continue
    for (const problem of readXml(reportPath).querySelectorAll('problem')) {
      const fileUrl = requiredText(problem, 'file')
      const prefix = 'file://$PROJECT_DIR$/'
      if (!fileUrl.startsWith(prefix)) throw new Error(`Unexpected inspection file URL: ${fileUrl}`)
      const file = fileUrl.slice(prefix.length)
      if (isTestFile(file)) continue
      const sourcePath = path.resolve(project, file)
      if (!sourcePath.startsWith(`${path.resolve(project)}${path.sep}`)) throw new Error(`Report path escapes project: ${file}`)
      const line = Number(requiredText(problem, 'line'))
      const sourceLine = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)[line - 1]
      if (!Number.isInteger(line) || sourceLine === undefined) throw new Error(`Invalid report location: ${file}:${line}`)
      const symbol = requiredText(problem, 'highlighted_element')
      const description = requiredText(problem, 'description').replace(/\s*#loc$/, '')
      const source = sourceLine.trim().replace(/\s+/g, ' ')
      const id = createHash('sha256').update(JSON.stringify([inspection, file, symbol, description, source])).digest('hex')
      findings.set(`${id}:${line}`, { id, inspection, file, line, symbol, description, source })
    }
  }
  return [...findings.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.inspection.localeCompare(b.inspection))
}

export function readInspectionBaseline(file: string): InspectionBaseline {
  const baseline = v.parse(BaselineSchema, JSON.parse(fs.readFileSync(file, 'utf8')))
  const ids = new Set<string>()
  for (const entry of baseline.entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate baseline entry: ${entry.id}`)
    ids.add(entry.id)
  }
  return baseline
}

export function compareInspectionBaseline(findings: InspectionFinding[], baseline: InspectionBaseline): InspectionComparison {
  const remaining = new Map(baseline.entries.map((entry) => [entry.id, entry.count]))
  const newFindings: InspectionFinding[] = []
  for (const finding of findings) {
    const count = remaining.get(finding.id)
    if (count !== undefined && count > 0) remaining.set(finding.id, count - 1)
    else newFindings.push(finding)
  }
  return {
    newFindings,
    staleEntries: baseline.entries.filter((entry) => remaining.get(entry.id) !== 0),
    suppressedCount: findings.length - newFindings.length,
  }
}
