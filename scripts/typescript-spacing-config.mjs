import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

const exportedDeclaration = (owner, type) => ({ selector: `${owner}[declaration.type='${type}']` })
const exportedFunction = exportedDeclaration('ExportNamedDeclaration', 'FunctionDeclaration')
const exportedFunctionOverload = exportedDeclaration('ExportNamedDeclaration', 'TSDeclareFunction')
const declarationTypes = [
  'type',
  'interface',
  'enum',
  'class',
  'function',
  'function-overload',
  { selector: 'Program > VariableDeclaration' },
  { selector: "Program > ExportNamedDeclaration[declaration.type='VariableDeclaration']" },
  { selector: 'TSModuleDeclaration' },
  ...[
    'TSTypeAliasDeclaration',
    'TSInterfaceDeclaration',
    'TSEnumDeclaration',
    'TSModuleDeclaration',
    'ClassDeclaration',
    'FunctionDeclaration',
    'TSDeclareFunction',
  ].map((type) => exportedDeclaration('ExportNamedDeclaration', type)),
  ...['ClassDeclaration', 'FunctionDeclaration'].map((type) => exportedDeclaration('ExportDefaultDeclaration', type)),
]

export const typescriptSpacingConfig = {
  files: ['**/*.{ts,tsx,mts,cts}'],
  languageOptions: {
    parser: tseslint.parser,
  },
  plugins: {
    '@stylistic': stylistic,
  },
  rules: {
    '@stylistic/padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: 'import', next: '*' },
      { blankLine: 'never', prev: 'import', next: 'import' },
      { blankLine: 'always', prev: '*', next: declarationTypes },
      { blankLine: 'always', prev: declarationTypes, next: '*' },
      { blankLine: 'never', prev: 'function-overload', next: ['function-overload', 'function'] },
      { blankLine: 'never', prev: exportedFunctionOverload, next: [exportedFunctionOverload, exportedFunction] },
    ],
    '@stylistic/lines-between-class-members': [
      'error',
      {
        enforce: [
          { blankLine: 'always', prev: '*', next: 'method' },
          { blankLine: 'always', prev: 'method', next: '*' },
        ],
      },
      { exceptAfterOverload: true },
    ],
  },
}
