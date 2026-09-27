import { ESLintUtils, type TSESTree, type TSESLint } from '@typescript-eslint/utils'
import ts from 'typescript'

type NamedFunction = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression

function isNamed(node: NamedFunction): boolean {
  return Boolean(node.id || node.parent.type === 'MethodDefinition' || (node.parent.type === 'Property' && node.parent.method))
}

function isVoidReturn(type: ts.Type, checker: ts.TypeChecker): boolean {
  const value = checker.getAwaitedType(type)
  if (!value) throw new Error('Cannot resolve the function return type')
  return Boolean(value.flags & ts.TypeFlags.Void)
}

function hasUnnamedObject(node: ts.Node, checker: ts.TypeChecker, visited = new Set<ts.Node>()): boolean {
  if (visited.has(node)) return false
  visited.add(node)
  if (ts.isTypeLiteralNode(node)) return true
  if (ts.isTypeReferenceNode(node)) {
    let symbol = checker.getSymbolAtLocation(node.typeName)
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
    for (const declaration of symbol?.declarations ?? []) {
      if (
        ts.isTypeAliasDeclaration(declaration) &&
        !declaration.getSourceFile().isDeclarationFile &&
        hasUnnamedObject(declaration.type, checker, visited)
      )
        return true
    }
    return node.typeArguments?.some((argument) => hasUnnamedObject(argument, checker, visited)) ?? false
  }
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) return hasUnnamedObject(node.type, checker, visited)
  return ts.forEachChild(node, (child) => hasUnnamedObject(child, checker, visited) || undefined) ?? false
}

export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      missing: 'Named functions must have an explicit return type (except void).',
      object: 'Use a named interface for object returns, including objects inside unions and containers.',
    },
  },
  defaultOptions: [],
  create(context): TSESLint.RuleListener {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()

    function check(node: NamedFunction) {
      if (!isNamed(node) || !node.body || (node.parent.type === 'MethodDefinition' && node.parent.kind === 'constructor')) return
      const declaration = services.esTreeNodeToTSNodeMap.get(node)
      const signature = checker.getSignatureFromDeclaration(declaration)
      if (!signature) throw new Error('Expected a function signature')
      if (!node.returnType) {
        if (!isVoidReturn(checker.getReturnTypeOfSignature(signature), checker))
          context.report({
            node,
            messageId: 'missing',
          })
        return
      }
      if (declaration.type && hasUnnamedObject(declaration.type, checker))
        context.report({
          node: node.returnType,
          messageId: 'object',
        })
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
    }
  },
})
