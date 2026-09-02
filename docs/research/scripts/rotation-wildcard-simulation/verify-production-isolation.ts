import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const RESEARCH_ROOT = join('docs', 'research')
const SIMULATION_MARKERS = ['docs/research', 'rotation-wildcard-simulation']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])
const BUILD_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.map'])

export interface IsolationVerification {
  sourceFilesChecked: number
  buildFilesChecked: number
  researchDigestsChecked: number
}

export function verifyProductionIsolation(
  repositoryRoot: string,
): IsolationVerification {
  const srcRoot = join(repositoryRoot, 'src')
  const researchRoot = join(repositoryRoot, RESEARCH_ROOT)
  const distRoot = join(repositoryRoot, 'dist')
  const manifestPath = join(distRoot, '.vite', 'manifest.json')

  if (!existsSync(srcRoot)) throw new Error('Missing src directory')
  if (!existsSync(manifestPath)) {
    throw new Error('Missing Vite build manifest at dist/.vite/manifest.json')
  }

  const sourceFiles = listFiles(srcRoot).filter((path) =>
    SOURCE_EXTENSIONS.has(extname(path)),
  )
  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, 'utf8')
    for (const imported of ts.preProcessFile(source).importedFiles) {
      const specifier = imported.fileName.replaceAll('\\', '/')
      const resolved = specifier.startsWith('.')
        ? resolve(dirname(sourceFile), specifier)
        : null
      const crossesResearch =
        specifier.includes('docs/research') ||
        (resolved !== null && isInside(resolved, researchRoot))
      if (crossesResearch) {
        throw new Error(
          `src import crosses the docs/research boundary: ${relative(repositoryRoot, sourceFile)} -> ${specifier}`,
        )
      }
    }
  }

  const researchDigests = existsSync(researchRoot)
    ? listFiles(researchRoot).map((path) =>
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      )
    : []
  const buildFiles = listFiles(distRoot).filter((path) =>
    BUILD_EXTENSIONS.has(extname(path)),
  )
  for (const buildFile of buildFiles) {
    const output = readFileSync(buildFile, 'utf8')
    const normalized = output.replaceAll('\\', '/')
    const marker = SIMULATION_MARKERS.find((value) => normalized.includes(value))
    const digest = researchDigests.find((value) => normalized.includes(value))
    if (marker || digest) {
      throw new Error(
        `Build output contains forbidden simulation marker or artifact hash: ${relative(repositoryRoot, buildFile)}`,
      )
    }
  }

  return {
    sourceFilesChecked: sourceFiles.length,
    buildFilesChecked: buildFiles.length,
    researchDigestsChecked: researchDigests.length,
  }
}

function listFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) files.push(...listFiles(path))
    else files.push(path)
  }
  return files
}

function isInside(path: string, root: string): boolean {
  const child = resolve(path)
  const parent = resolve(root)
  return child === parent || child.startsWith(`${parent}${sep}`)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  const result = verifyProductionIsolation(process.cwd())
  console.log(
    `Production isolation verified: ${result.sourceFilesChecked} source files, ${result.buildFilesChecked} build files, ${result.researchDigestsChecked} research digests`,
  )
}
