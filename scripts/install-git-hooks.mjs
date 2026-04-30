#!/usr/bin/env node
import { chmod, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(here, '..')

const resolveHooksDir = (repoRoot) => {
  return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
}

export async function installHooks({ repoRoot = defaultRepoRoot, hooksDir } = {}) {
  const resolvedHooksDir = hooksDir ?? resolveHooksDir(repoRoot)
  await mkdir(resolvedHooksDir, { recursive: true })

  const hookFiles = [
    ['scripts/pre-commit', 'pre-commit'],
    ['scripts/prepare-commit-msg', 'prepare-commit-msg'],
  ]

  for (const [sourceRelativePath, hookName] of hookFiles) {
    const sourcePath = path.join(repoRoot, sourceRelativePath)
    const destinationPath = path.join(resolvedHooksDir, hookName)
    await copyFile(sourcePath, destinationPath)
    await chmod(destinationPath, 0o755)
  }
}

const invokedDirectly = (() => {
  const scriptPath = process.argv[1]
  return typeof scriptPath === 'string' && path.resolve(scriptPath) === fileURLToPath(import.meta.url)
})()

if (invokedDirectly) {
  await installHooks()
}
