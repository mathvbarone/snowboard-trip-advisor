import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureWorkspaceDir } from '../workspace'

describe('ensureWorkspaceDir (PR 4.1b §2.2, spec §10.9)', (): void => {
  let root: string

  beforeEach(async (): Promise<void> => {
    root = await mkdtemp(join(tmpdir(), 'ws-test-'))
  })

  afterEach(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })

  it('creates data/admin-workspace/ when absent', async (): Promise<void> => {
    await ensureWorkspaceDir(root)
    const s = await stat(join(root, 'data', 'admin-workspace'))
    expect(s.isDirectory()).toBe(true)
  })

  it('is idempotent (mkdir -p semantics)', async (): Promise<void> => {
    await ensureWorkspaceDir(root)
    await expect(ensureWorkspaceDir(root)).resolves.toBeUndefined()
  })

  it('creates the data parent dir too if missing', async (): Promise<void> => {
    await ensureWorkspaceDir(root)
    const dataStat = await stat(join(root, 'data'))
    expect(dataStat.isDirectory()).toBe(true)
  })
})
