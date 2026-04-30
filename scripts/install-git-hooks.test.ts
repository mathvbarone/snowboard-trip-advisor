import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { installHooks } from './install-git-hooks.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const prepareCommitMsgHook = path.join(repoRoot, 'scripts', 'prepare-commit-msg')

const exec = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const exitCode = code ?? -1
      const exitCodeText = String(exitCode)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} exited ${exitCodeText}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      )
    })
  })

describe('installHooks', (): void => {
  it('installs both tracked git hooks and marks them executable', async (): Promise<void> => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-hooks-vitest-'))
    try {
      const hooksDir = path.join(tempDir, 'hooks')
      await installHooks({ repoRoot, hooksDir })

      const preCommitPath = path.join(hooksDir, 'pre-commit')
      const prepareCommitMsgPath = path.join(hooksDir, 'prepare-commit-msg')

      expect(await readFile(preCommitPath, 'utf8')).toMatch(/npm run qa/)
      expect(await readFile(prepareCommitMsgPath, 'utf8')).toMatch(/Signed-off-by:/)

      const preCommitStat = await stat(preCommitPath)
      const prepareCommitMsgStat = await stat(prepareCommitMsgPath)

      expect((preCommitStat.mode & 0o111) !== 0).toBe(true)
      expect((prepareCommitMsgStat.mode & 0o111) !== 0).toBe(true)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('resolves the live hooks directory via git rev-parse when hooksDir is omitted', async (): Promise<void> => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-install-hooks-live-vitest-'))
    try {
      await exec('git', ['init'], { cwd: tempDir })
      await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
      await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

      await mkdir(path.join(tempDir, 'scripts'))
      await writeFile(path.join(tempDir, 'scripts', 'pre-commit'), '#!/bin/sh\n')
      await writeFile(path.join(tempDir, 'scripts', 'prepare-commit-msg'), '#!/bin/sh\n')

      await installHooks({ repoRoot: tempDir })

      const { stdout: hooksPath } = await exec('git', ['rev-parse', '--git-path', 'hooks'], {
        cwd: tempDir,
      })
      const hooksDir = path.isAbsolute(hooksPath.trim())
        ? hooksPath.trim()
        : path.resolve(tempDir, hooksPath.trim())
      const preCommitStat = await stat(path.join(hooksDir, 'pre-commit'))
      const prepareCommitMsgStat = await stat(path.join(hooksDir, 'prepare-commit-msg'))

      expect((preCommitStat.mode & 0o111) !== 0).toBe(true)
      expect((prepareCommitMsgStat.mode & 0o111) !== 0).toBe(true)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('runs the CLI entrypoint when invoked directly', async (): Promise<void> => {
    const originalArgv1 = process.argv[1]
    const scriptPath = path.join(repoRoot, 'scripts', 'install-git-hooks.mjs')
    const importSuffix = String(Date.now())
    try {
      process.argv[1] = scriptPath
      await import(`${pathToFileURL(scriptPath).href}?direct-invoke=${importSuffix}`)

      const { stdout } = await exec('git', ['rev-parse', '--git-path', 'hooks'], { cwd: repoRoot })
      const hooksDir = path.isAbsolute(stdout.trim())
        ? stdout.trim()
        : path.resolve(repoRoot, stdout.trim())

      expect(await readFile(path.join(hooksDir, 'pre-commit'), 'utf8')).toMatch(/npm run qa/)
      expect(await readFile(path.join(hooksDir, 'prepare-commit-msg'), 'utf8')).toMatch(
        /Signed-off-by:/,
      )
    } finally {
      if (originalArgv1 === undefined) {
        process.argv.splice(1, 1)
      } else {
        process.argv[1] = originalArgv1
      }
    }
  })
})

describe('prepare-commit-msg', (): void => {
  it('appends a DCO trailer when identity is configured', async (): Promise<void> => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-prepare-commit-msg-vitest-'))
    try {
      await exec('git', ['init'], { cwd: tempDir })
      await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
      await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

      const messagePath = path.join(tempDir, 'COMMIT_EDITMSG')
      await writeFile(messagePath, 'feat: add tracked hook installer\n')

      await exec(prepareCommitMsgHook, [messagePath], { cwd: tempDir })

      expect(await readFile(messagePath, 'utf8')).toMatch(
        /Signed-off-by: Snowboard Bot <bot@example\.com>/,
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('does not duplicate an existing DCO trailer', async (): Promise<void> => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-prepare-commit-msg-vitest-'))
    try {
      await exec('git', ['init'], { cwd: tempDir })
      await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
      await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

      const messagePath = path.join(tempDir, 'COMMIT_EDITMSG')
      await writeFile(
        messagePath,
        'feat: add tracked hook installer\n\nSigned-off-by: Snowboard Bot <bot@example.com>\n',
      )

      await exec(prepareCommitMsgHook, [messagePath], { cwd: tempDir })

      const message = await readFile(messagePath, 'utf8')
      expect(message.match(/Signed-off-by: Snowboard Bot <bot@example\.com>/g)?.length).toBe(1)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('skips merge and squash commit sources', async (): Promise<void> => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-prepare-commit-msg-vitest-'))
    try {
      await exec('git', ['init'], { cwd: tempDir })
      await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
      await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

      const messagePath = path.join(tempDir, 'COMMIT_EDITMSG')
      await writeFile(messagePath, 'Merge branch x\n')

      await exec(prepareCommitMsgHook, [messagePath, 'merge'], { cwd: tempDir })
      expect(await readFile(messagePath, 'utf8')).toBe('Merge branch x\n')

      await exec(prepareCommitMsgHook, [messagePath, 'squash'], { cwd: tempDir })
      expect(await readFile(messagePath, 'utf8')).toBe('Merge branch x\n')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
