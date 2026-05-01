import { describe, expect, it, vi } from 'vitest'

import {
  installHook,
  installHooks,
  type HookInstallSpec,
} from './install-git-hooks'

const SPEC_A: HookInstallSpec = {
  name: 'pre-commit',
  sourcePath: '/repo/scripts/pre-commit',
  targetPath: '/repo/.git/hooks/pre-commit',
}

const SPEC_B: HookInstallSpec = {
  name: 'prepare-commit-msg',
  sourcePath: '/repo/scripts/prepare-commit-msg',
  targetPath: '/repo/.git/hooks/prepare-commit-msg',
}

const noopWrite = (): Promise<void> => Promise.resolve()
const enoent = (): Promise<string> => Promise.reject(new Error('ENOENT'))

describe('installHook', (): void => {
  it("writes the source content to the target when the target doesn't exist", async (): Promise<void> => {
    const read = vi.fn((path: string): Promise<string> => {
      if (path === '/repo/scripts/pre-commit') {
        return Promise.resolve('hook body')
      }
      return enoent()
    })
    const write = vi.fn(noopWrite)

    const result = await installHook(SPEC_A, read, write)

    expect(result).toEqual({ hook: 'pre-commit', status: 'installed' })
    expect(write).toHaveBeenCalledWith(
      '/repo/.git/hooks/pre-commit',
      'hook body',
    )
  })

  it('reports unchanged when the target already has identical content', async (): Promise<void> => {
    const read = vi.fn((): Promise<string> => Promise.resolve('hook body'))
    const write = vi.fn(noopWrite)

    const result = await installHook(SPEC_A, read, write)

    expect(result).toEqual({ hook: 'pre-commit', status: 'unchanged' })
    expect(write).not.toHaveBeenCalled()
  })

  it('overwrites when target exists with different content', async (): Promise<void> => {
    const read = vi.fn((path: string): Promise<string> => {
      if (path === '/repo/scripts/pre-commit') {
        return Promise.resolve('new body')
      }
      return Promise.resolve('stale body')
    })
    const write = vi.fn(noopWrite)

    const result = await installHook(SPEC_A, read, write)

    expect(result).toEqual({ hook: 'pre-commit', status: 'installed' })
    expect(write).toHaveBeenCalledWith(
      '/repo/.git/hooks/pre-commit',
      'new body',
    )
  })

  it('reports source_missing when the source file cannot be read', async (): Promise<void> => {
    const read = vi.fn((): Promise<string> =>
      Promise.reject(new Error('ENOENT: scripts/pre-commit')),
    )
    const write = vi.fn(noopWrite)

    const result = await installHook(SPEC_A, read, write)

    expect(result.status).toBe('source_missing')
    expect(result.hook).toBe('pre-commit')
    expect(result.reason).toContain('ENOENT')
    expect(write).not.toHaveBeenCalled()
  })

  it('reports source_missing when the read error is not an Error instance', async (): Promise<void> => {
    const read = vi.fn(
      (): Promise<string> =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- exercising the non-Error branch in reasonFromError
        Promise.reject('permission denied'),
    )
    const write = vi.fn(noopWrite)

    const result = await installHook(SPEC_A, read, write)

    expect(result).toEqual({
      hook: 'pre-commit',
      status: 'source_missing',
      reason: 'permission denied',
    })
  })

  it('reports write_failed when the source reads but the target write throws', async (): Promise<void> => {
    const read = vi.fn((path: string): Promise<string> => {
      if (path === '/repo/scripts/pre-commit') {
        return Promise.resolve('hook body')
      }
      return enoent()
    })
    const write = vi.fn(
      (): Promise<void> =>
        Promise.reject(new Error('EACCES: read-only filesystem')),
    )

    const result = await installHook(SPEC_A, read, write)

    expect(result.status).toBe('write_failed')
    expect(result.hook).toBe('pre-commit')
    expect(result.reason).toContain('EACCES')
  })

  it('reports write_failed when the write error is not an Error instance', async (): Promise<void> => {
    const read = vi.fn((path: string): Promise<string> => {
      if (path === '/repo/scripts/pre-commit') {
        return Promise.resolve('hook body')
      }
      return enoent()
    })
    const write = vi.fn(
      (): Promise<void> =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- exercising the non-Error branch in reasonFromError
        Promise.reject('disk full'),
    )

    const result = await installHook(SPEC_A, read, write)

    expect(result).toEqual({
      hook: 'pre-commit',
      status: 'write_failed',
      reason: 'disk full',
    })
  })
})

describe('installHooks', (): void => {
  it('returns an empty array for an empty spec list', async (): Promise<void> => {
    const read = vi.fn((): Promise<string> => Promise.resolve(''))
    const write = vi.fn(noopWrite)

    expect(await installHooks([], read, write)).toEqual([])
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('processes specs in order and returns all results', async (): Promise<void> => {
    const order: string[] = []
    const read = vi.fn((path: string): Promise<string> => {
      order.push(`read:${path}`)
      if (path.includes('scripts/pre-commit')) {
        return Promise.resolve('pre body')
      }
      if (path.includes('scripts/prepare-commit-msg')) {
        return Promise.resolve('prep body')
      }
      return enoent()
    })
    const write = vi.fn((path: string): Promise<void> => {
      order.push(`write:${path}`)
      return Promise.resolve()
    })

    const results = await installHooks([SPEC_A, SPEC_B], read, write)

    expect(results).toEqual([
      { hook: 'pre-commit', status: 'installed' },
      { hook: 'prepare-commit-msg', status: 'installed' },
    ])
    expect(order[0]).toBe('read:/repo/scripts/pre-commit')
    expect(order[order.length - 1]).toContain(
      'write:/repo/.git/hooks/prepare-commit-msg',
    )
  })

  it('continues past a failed spec and reports each independently', async (): Promise<void> => {
    const read = vi.fn((path: string): Promise<string> => {
      if (path === '/repo/scripts/pre-commit') {
        return Promise.reject(new Error('ENOENT: pre-commit source missing'))
      }
      if (path === '/repo/scripts/prepare-commit-msg') {
        return Promise.resolve('prep body')
      }
      return enoent()
    })
    const write = vi.fn(noopWrite)

    const results = await installHooks([SPEC_A, SPEC_B], read, write)

    expect(results.length).toBe(2)
    expect(results[0]?.status).toBe('source_missing')
    expect(results[1]?.status).toBe('installed')
  })
})
