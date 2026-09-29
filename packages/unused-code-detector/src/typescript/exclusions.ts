import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import type { Location, Position } from 'vscode-languageserver-protocol/node'
import { relativeFile } from '../files.js'
import type { DeclarationReview } from '../detector.js'

export interface TypeScriptExclusionCommands {
  review: (file: string, position: Position) => DeclarationReview
}

export interface ExternalConfigurationContract {
  exportName: string
  reason: string
}

export interface TypeScriptExclusionOptions {
  entryPoints: Map<string, string>
  externalConfigurations: Map<string, ExternalConfigurationContract>
}

function declarationName(node: ts.Node): ts.DeclarationName | undefined {
  if (
    ts.isVariableDeclaration(node) ||
    ts.isBindingElement(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isEnumMember(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isShorthandPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isParameter(node)
  )
    return node.name
  return undefined
}

function declarationAt(source: ts.SourceFile, position: Position): ts.Node | undefined {
  const offset = source.getPositionOfLineAndCharacter(position.line, position.character)
  let result: ts.Node | undefined

  function visit(node: ts.Node) {
    if (offset < node.getFullStart() || offset >= node.getEnd()) return
    const name = declarationName(node)
    if (name && offset >= name.getStart(source) && offset < name.getEnd()) result = node
    ts.forEachChild(node, visit)
  }

  visit(source)
  return result
}

function external(node: ts.Node): boolean {
  return /[/\\]node_modules[/\\]/.test(node.getSourceFile().fileName)
}

function propertyInitializer(node: ts.Node): boolean {
  return (
    ts.isPropertyAssignment(node) ||
    ts.isShorthandPropertyAssignment(node) ||
    (ts.isMethodDeclaration(node) && ts.isObjectLiteralExpression(node.parent))
  )
}

function propertyType(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Type | undefined {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
  return declaration && checker.getTypeOfSymbolAtLocation(symbol, declaration)
}

function location(node: ts.Node): Location | undefined {
  const name = declarationName(node)
  if (!name) return undefined
  const source = node.getSourceFile()
  return {
    uri: pathToFileURL(source.fileName).href,
    range: {
      start: source.getLineAndCharacterOfPosition(name.getStart(source)),
      end: source.getLineAndCharacterOfPosition(name.getEnd()),
    },
  }
}

export function createTypeScriptExclusions(root: string, files: string[], options: TypeScriptExclusionOptions, isTestFile: (file: string) => boolean): TypeScriptExclusionCommands {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  if (parsed.errors.length)
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  const program = ts.createProgram(files, {
    ...parsed.options,
    allowJs: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const reasons = new Map<ts.Node, string>()
  const links = new Map<ts.Node, Set<ts.Node>>()
  const pairs = new Map<ts.Type, Set<ts.Type>>()
  const dynamicImports = new Map<string, string>()
  const { entryPoints, externalConfigurations } = options

  function describe(node: ts.Node): string {
    const source = node.getSourceFile()
    return `${relativeFile(root, source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`
  }

  function mark(symbol: ts.Symbol, reason: string) {
    for (const declaration of symbol.declarations ?? []) {
      if (!external(declaration)) reasons.set(declaration, reason)
    }
  }

  function linkTypes(actual: ts.Type, expected: ts.Type) {
    if (actual === expected) return
    const seen = pairs.get(actual) ?? new Set<ts.Type>()
    if (seen.has(expected)) return
    seen.add(expected)
    pairs.set(actual, seen)
    const constraint = checker.getBaseConstraintOfType(expected)
    if (constraint && constraint !== expected) {
      linkTypes(actual, constraint)
      return
    }
    if (actual.isUnion()) {
      for (const part of actual.types) linkTypes(part, expected)
      return
    }
    if (expected.isUnion()) {
      for (const part of expected.types) {
        if (checker.isTypeAssignableTo(actual, checker.getBaseConstraintOfType(part) ?? part)) linkTypes(actual, part)
      }
      return
    }
    if (!(actual.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection | ts.TypeFlags.Union))) return
    for (const member of actual.getProperties()) {
      const declarations = member.declarations?.filter((declaration) => !external(declaration)) ?? []
      if (!declarations.length) continue
      const target = expected.getProperty(member.name)
      if (!target) {
        if (
          expected.getStringIndexType() &&
          (expected.symbol?.declarations?.some(external) ||
            expected.aliasSymbol?.declarations?.some(external) ||
            checker.getIndexInfosOfType(expected).some((info) => info.declaration && external(info.declaration)))
        ) {
          for (const declaration of declarations) {
            if (propertyInitializer(declaration)) reasons.set(declaration, 'Index-signature object contract')
          }
        }
        continue
      }
      for (const declaration of declarations) {
        for (const destination of target.declarations ?? []) {
          if (destination === declaration) continue
          if (external(destination)) {
            reasons.set(declaration, `External property contract: ${target.name}`)
          } else {
            const targets = links.get(declaration) ?? new Set<ts.Node>()
            targets.add(destination)
            links.set(declaration, targets)
          }
        }
      }
      const actualMember = propertyType(checker, member)
      const expectedMember = propertyType(checker, target)
      if (actualMember && expectedMember) linkTypes(actualMember, expectedMember)
    }
    const actualElement = actual.getNumberIndexType()
    const expectedElement = expected.getNumberIndexType()
    if (actualElement && expectedElement) linkTypes(actualElement, expectedElement)
    const actualAwaited = checker.getAwaitedType(actual)
    const expectedAwaited = checker.getAwaitedType(expected)
    if (actualAwaited && expectedAwaited && actualAwaited !== actual && expectedAwaited !== expected)
      linkTypes(actualAwaited, expectedAwaited)
    for (const actualCall of actual.getCallSignatures()) {
      for (const expectedCall of expected.getCallSignatures()) {
        linkTypes(actualCall.getReturnType(), expectedCall.getReturnType())
      }
    }
  }

  function contextual(expression: ts.Expression) {
    const expected = checker.getContextualType(expression)
    if (expected) linkTypes(checker.getTypeAtLocation(expression), expected)
  }

  function markConsumedProperties(type: ts.Type, reason: string, seen: Set<ts.Type>) {
    if (seen.has(type)) return
    seen.add(type)
    if (type.isUnion()) {
      for (const part of type.types) markConsumedProperties(part, reason, seen)
      return
    }
    if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection | ts.TypeFlags.Union))) return
    for (const member of type.getProperties()) {
      if (!member.declarations?.some((declaration) => !external(declaration))) continue
      mark(member, reason)
      const child = propertyType(checker, member)
      if (child) markConsumedProperties(child, reason, seen)
    }
    const element = type.getNumberIndexType()
    if (element) markConsumedProperties(element, reason, seen)
  }

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) {
      for (const target of companion(node)) linkTypes(checker.getTypeAtLocation(node), checker.getTypeAtLocation(target))
    }
    if (ts.isExpression(node)) contextual(node)
    if (ts.isArrayLiteralExpression(node)) {
      const elementType = checker.getTypeAtLocation(node).getNumberIndexType()
      if (elementType) {
        for (const element of node.elements) {
          if (!ts.isSpreadElement(element)) linkTypes(checker.getTypeAtLocation(element), elementType)
        }
      }
    }
    if (ts.isElementAccessExpression(node)) {
      const type = checker.getTypeAtLocation(node.expression)
      const key = checker.getTypeAtLocation(node.argumentExpression)
      const keyTypes = key.isUnion() ? key.types : [key]
      for (const member of type.getProperties()) {
        if (
          keyTypes.some((part) =>
            part.isStringLiteral()
              ? part.value === member.name
              : part.isNumberLiteral()
                ? String(part.value) === member.name
                : Boolean(part.flags & ts.TypeFlags.String),
          )
        )
          mark(member, `Indexed read: ${describe(node)}`)
      }
    }
    if (ts.isCallExpression(node)) {
      for (const signature of checker.getTypeAtLocation(node.expression).getCallSignatures()) {
        if (signature.declaration !== checker.getResolvedSignature(node)?.declaration) continue
        for (let index = 0; index < node.arguments.length; index += 1) {
          const parameter = signature.parameters[index] ?? signature.parameters.at(-1)
          if (!parameter) continue
          let expected = checker.getTypeOfSymbolAtLocation(parameter, node.expression)
          const declaration = parameter.valueDeclaration
          if (declaration && ts.isParameter(declaration) && declaration.dotDotDotToken) {
            const element = expected.getProperty(String(index - signature.parameters.length + 1))
            const elementType = element ? checker.getTypeOfSymbolAtLocation(element, node.expression) : expected.getNumberIndexType()
            if (!elementType) continue
            expected = elementType
          } else if (index >= signature.parameters.length) continue
          linkTypes(checker.getTypeAtLocation(node.arguments[index]), expected)
        }
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        const moduleSymbol = checker.getSymbolAtLocation(node.arguments[0])
        for (const declaration of moduleSymbol?.declarations ?? [])
          dynamicImports.set(declaration.getSourceFile().fileName, `Dynamic module consumer: ${describe(node)}`)
      }
      const signature = checker.getResolvedSignature(node)
      const declaration = signature?.declaration
      if (declaration && external(declaration)) {
        const functionName = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined
        const receiver = ts.isPropertyAccessExpression(node.expression) ? node.expression.expression.getText() : undefined
        if (
          (receiver === 'JSON' && functionName === 'stringify') ||
          (receiver === 'Response' && functionName === 'json') ||
          (receiver === 'Object' && ['keys', 'values', 'entries'].includes(functionName ?? ''))
        ) {
          const value = node.arguments[0]
          if (value) {
            const type = checker.getTypeAtLocation(value)
            const reason = `Reflective consumer: ${describe(node)}`
            if (receiver === 'JSON' || receiver === 'Response') markConsumedProperties(type, reason, new Set())
            else for (const member of type.getProperties()) mark(member, reason)
          }
        }
        if (functionName === 'exposeInMainWorld' && /[/\\]electron[/\\]/.test(declaration.getSourceFile().fileName)) {
          const api = node.arguments[1]
          if (api) markConsumedProperties(checker.getTypeAtLocation(api), `Electron renderer bridge: ${describe(node)}`, new Set())
        }
        if (/[/\\]valibot[/\\]/.test(declaration.getSourceFile().fileName)) {
          for (const argument of node.arguments) {
            if (ts.isObjectLiteralExpression(argument))
              markConsumedProperties(checker.getTypeAtLocation(argument), `Validation schema: ${describe(node)}`, new Set())
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  for (const file of files) {
    const source = program.getSourceFile(file)
    if (!source) throw new Error(`TypeScript exclusion analysis did not load ${file}`)
    if (!source.isDeclarationFile && !isTestFile(relativeFile(root, file))) visit(source)
    const contract = externalConfigurations.get(relativeFile(root, file))
    const module = checker.getSymbolAtLocation(source)
    if (contract && module) {
      const exported = checker.getExportsOfModule(module).find((symbol) => symbol.name === contract.exportName)
      if (exported) markConsumedProperties(checker.getTypeOfSymbolAtLocation(exported, source), contract.reason, new Set())
    }
  }

  function companion(node: ts.Node): ts.Node[] {
    const source = node.getSourceFile()
    const companionPath = source.fileName.replace(/\.(mjs|cjs|js)$/, (extension) =>
      extension === '.mjs' ? '.d.mts' : extension === '.cjs' ? '.d.cts' : '.d.ts',
    )
    if (companionPath === source.fileName) return []
    const name = declarationName(node)
    const counterpart = program.getSourceFile(companionPath)
    if (!name || !counterpart) return []
    const implementation = checker.getSymbolAtLocation(source)
    const declarations = checker.getSymbolAtLocation(counterpart)
    if (!implementation || !declarations) return []
    const symbol = checker.getSymbolAtLocation(name)
    const exported = checker
      .getExportsOfModule(implementation)
      .find((item) => (item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item) === symbol)
    if (!exported) return []
    return [...(checker.getExportsOfModule(declarations).find((item) => item.name === exported.name)?.declarations ?? [])]
  }

  return {
    review: (file, position) => {
      const source = program.getSourceFile(file)
      if (!source) throw new Error(`Missing TypeScript exclusion source: ${file}`)
      const node = declarationAt(source, position)
      if (!node)
        return {
          referenceTargets: [],
        }
      const name = declarationName(node)
      if (name && ts.isComputedPropertyName(name) && !ts.isStringLiteralLike(name.expression) && !ts.isNumericLiteral(name.expression))
        return {
          reason: 'Computed-key write; the key expression is checked separately',
          referenceTargets: [],
        }
      const entryPoint = name && entryPoints.get(`${relativeFile(root, file)}#${name.getText(source)}`)
      if (entryPoint)
        return {
          reason: entryPoint,
          referenceTargets: [],
        }
      if (ts.isFunctionExpression(node))
        return {
          reason: 'Function expression consumed through its enclosing value',
          referenceTargets: [],
        }
      if (
        ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent) &&
        !node.dotDotDotToken &&
        node.parent.elements.some((element) => element.dotDotDotToken)
      )
        return {
          reason: 'Object-rest omission binding',
          referenceTargets: [],
        }
      if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        const dynamic = dynamicImports.get(source.fileName)
        if (dynamic)
          return {
            reason: dynamic,
            referenceTargets: [],
          }
      }
      const visited = new Set<ts.Node>()
      const referenceTargets: Location[] = []

      function collect(current: ts.Node): string | undefined {
        if (visited.has(current)) return undefined
        visited.add(current)
        const reason = reasons.get(current)
        if (reason) return reason
        if (current !== node) {
          const target = location(current)
          if (target) referenceTargets.push(target)
        }
        for (const target of [...(links.get(current) ?? []), ...companion(current)]) {
          const inherited = collect(target)
          if (inherited) return inherited
        }
        return undefined
      }

      return {
        reason: collect(node),
        referenceTargets,
      }
    },
  }
}
