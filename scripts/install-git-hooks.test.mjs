#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { installHooks } from './install-git-hooks.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const prepareCommitMsgHook = path.join(repoRoot, 'scripts', 'prepare-commit-msg')

const exec = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      )
    })
  })

test('installHooks installs both tracked git hooks and marks them executable', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-hooks-'))
  try {
    const hooksDir = path.join(tempDir, 'hooks')
    await installHooks({ repoRoot, hooksDir })

    const preCommitPath = path.join(hooksDir, 'pre-commit')
    const prepareCommitMsgPath = path.join(hooksDir, 'prepare-commit-msg')

    assert.match(await readFile(preCommitPath, 'utf8'), /npm run qa/)
    assert.match(await readFile(prepareCommitMsgPath, 'utf8'), /Signed-off-by:/)

    const preCommitStat = await stat(preCommitPath)
    const prepareCommitMsgStat = await stat(prepareCommitMsgPath)

    assert.ok((preCommitStat.mode & 0o111) !== 0, 'pre-commit should be executable')
    assert.ok(
      (prepareCommitMsgStat.mode & 0o111) !== 0,
      'prepare-commit-msg should be executable',
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('installHooks resolves the live hooks directory via git rev-parse when hooksDir is omitted', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-install-hooks-live-'))
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

    assert.ok((preCommitStat.mode & 0o111) !== 0, 'resolved pre-commit should be executable')
    assert.ok(
      (prepareCommitMsgStat.mode & 0o111) !== 0,
      'resolved prepare-commit-msg should be executable',
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('prepare-commit-msg appends a DCO trailer when identity is configured', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-prepare-commit-msg-'))
  try {
    await exec('git', ['init'], { cwd: tempDir })
    await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
    await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

    const messagePath = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(messagePath, 'feat: add tracked hook installer\n')

    await exec(prepareCommitMsgHook, [messagePath], { cwd: tempDir })

    const message = await readFile(messagePath, 'utf8')
    assert.match(message, /Signed-off-by: Snowboard Bot <bot@example\.com>/)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('prepare-commit-msg does not duplicate an existing DCO trailer', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-prepare-commit-msg-'))
  try {
    await exec('git', ['init'], { cwd: tempDir })
    await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
    await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

    const messagePath = path.join(tempDir, 'COMMIT_EDITMSG')
    const trailer = 'Signed-off-by: Snowboard Bot <bot@example.com>'
    await writeFile(messagePath, `feat: add tracked hook installer\n\n${trailer}\n`)

    await exec(prepareCommitMsgHook, [messagePath], { cwd: tempDir })

    const message = await readFile(messagePath, 'utf8')
    assert.equal(message.match(/Signed-off-by: Snowboard Bot <bot@example\.com>/g)?.length, 1)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('prepare-commit-msg skips merge and squash commit sources', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sta-prepare-commit-msg-'))
  try {
    await exec('git', ['init'], { cwd: tempDir })
    await exec('git', ['config', 'user.name', 'Snowboard Bot'], { cwd: tempDir })
    await exec('git', ['config', 'user.email', 'bot@example.com'], { cwd: tempDir })

    const messagePath = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(messagePath, 'Merge branch x\n')

    await exec(prepareCommitMsgHook, [messagePath, 'merge'], { cwd: tempDir })
    const mergeMessage = await readFile(messagePath, 'utf8')
    assert.equal(mergeMessage, 'Merge branch x\n')

    await exec(prepareCommitMsgHook, [messagePath, 'squash'], { cwd: tempDir })
    const squashMessage = await readFile(messagePath, 'utf8')
    assert.equal(squashMessage, 'Merge branch x\n')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
