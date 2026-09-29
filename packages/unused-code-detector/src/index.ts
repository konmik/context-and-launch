export { inspectUnusedCode } from './detector.js'
export type {
  DeclarationReview,
  DetectorCommands,
  DetectorOptions,
  ExcludedDeclaration,
  LspFinding,
  LspReport,
  ReferenceLocation,
} from './detector.js'
export { createLanguageServer } from './lsp-client.js'
export type { LanguageServerCommands } from './lsp-client.js'
export { compareInspectionBaseline, readInspectionBaseline } from './baseline.js'
export type { BaselineEntry, BaselineFinding, InspectionBaseline, InspectionComparison } from './baseline.js'
