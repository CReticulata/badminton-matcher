import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const nodeBuiltins = new Set('assert assert/strict async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns dns/promises domain events fs fs/promises http http2 https module net os path path/posix path/win32 perf_hooks process punycode querystring readline readline/promises repl stream stream/consumers stream/promises stream/web string_decoder sys test timers timers/promises tls trace_events tty url util util/types v8 vm wasi worker_threads zlib'.split(' '))

function loadCompilerOptions(): ts.CompilerOptions {
  const path = ts.findConfigFile(repoRoot, ts.sys.fileExists, 'tsconfig.app.json')
  if (path === undefined) throw new Error('tsconfig.app.json is required for the architecture gate')
  const config = ts.readConfigFile(path, ts.sys.readFile)
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  return ts.parseJsonConfigFileContent(config.config, ts.sys, repoRoot).options
}

function forbiddenDependency(specifier: string, resolved?: string): boolean {
  const normalized = (resolved ?? specifier).replaceAll('\\', '/')
  return specifier.startsWith('node:')
    || nodeBuiltins.has(specifier)
    || specifier === 'vue'
    || specifier.startsWith('@vue/')
    || specifier.endsWith('.py')
    || /(^|\/)analysis\//.test(specifier)
    || /(^|\/)(store|glicko2|matchmaking|csv)(\.ts)?$/.test(normalized)
    || normalized.endsWith('.vue')
    || /(^|\/)analysis\//.test(normalized)
    || normalized.endsWith('.py')
}

function closure(
  entries: readonly string[],
  host = ts.createCompilerHost(loadCompilerOptions()),
  options = loadCompilerOptions(),
) {
  const seen = new Set<string>()
  const violations: string[] = []
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = ts.createSourceFile(file, host.readFile(file) ?? '', ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node) => {
      const moduleNode = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined
      if (moduleNode && ts.isStringLiteral(moduleNode)) {
        const specifier = moduleNode.text
        const resolved = ts.resolveModuleName(specifier, file, options, host).resolvedModule?.resolvedFileName
        if (forbiddenDependency(specifier, resolved)) violations.push(`${file} -> ${specifier}`)
        if (resolved && !resolved.includes('/node_modules/')) walk(resolved)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  entries.forEach(walk)
  return { seen, violations }
}

describe('rating-j1 import architecture', () => {
  it('discovers every production entry and recursively exposes no forbidden authority dependency', () => {
    const root = new URL('..', import.meta.url).pathname
    const productionEntries = ts.sys.readDirectory(root, ['.ts'], undefined, ['*.ts'], 1)
      .filter((path) => !path.includes('/__tests__/'))
    const worker = new URL('../../../workers/j1-shadow.worker.ts', import.meta.url).pathname
    expect(productionEntries.map((path) => path.slice(path.lastIndexOf('/') + 1)).sort()).toEqual([
      'causal.ts', 'diagnostics.ts', 'eligibility.ts', 'endpoint.ts', 'filter.ts', 'numeric.ts',
      'quadrature.ts', 'selection.ts', 'serialization.ts', 'shadow.ts', 'state.ts', 'types.ts',
      'worker-handler.ts',
    ])
    const graph = closure([...productionEntries, worker])
    expect(graph.seen.size).toBeGreaterThan(productionEntries.length)
    expect(graph.violations).toEqual([])
  })

  it('detects forbidden dependencies hidden behind re-exports, Vue, and Node builtins', () => {
    const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext }
    const host = ts.createCompilerHost(options)
    const files: Record<string, string> = {
      '/entry.ts': "export * from './dto'",
      '/dto.ts': "export * from './forbidden'",
      '/forbidden.ts': "import '../src/store'; import 'vue'; import 'node:fs'",
    }
    host.readFile = (file) => files[file] ?? ''
    host.fileExists = (file) => file in files
    const graph = closure(['/entry.ts'], host, options)
    expect(graph.violations).toEqual(expect.arrayContaining([
      '/forbidden.ts -> ../src/store',
      '/forbidden.ts -> vue',
      '/forbidden.ts -> node:fs',
    ]))
  })
})
