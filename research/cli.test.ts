import { describe, expect, it, vi } from 'vitest'
import { parseCommand, runCli, runIfDirectRun } from './cli'

describe('parseCommand', () => {
  it('parses refresh stale', () => {
    expect(parseCommand(['refresh', 'stale'])).toEqual({
      action: 'refresh',
      scope: 'stale',
    })
  })

  it('parses publish latest', () => {
    expect(parseCommand(['publish', 'latest'])).toEqual({
      action: 'publish',
      scope: 'latest',
    })
  })

  it('preserves unknown actions for downstream rejection', () => {
    expect(parseCommand(['sync'])).toEqual({
      action: 'sync',
      scope: 'all',
    })
  })
})

describe('runCli', () => {
  it('dispatches refresh commands', async () => {
    await expect(runCli(['refresh', 'stale'])).resolves.toEqual({
      ok: true,
      action: 'refresh',
      scope: 'stale',
    })
  })

  it('dispatches publish commands', async () => {
    await expect(runCli(['publish', 'latest'])).resolves.toEqual({
      ok: true,
      action: 'publish',
      scope: 'latest',
    })
  })

  it('rejects unknown commands', async () => {
    await expect(runCli(['sync'])).rejects.toThrow('Unknown command: sync')
  })
})

describe('runIfDirectRun', () => {
  it('runs the CLI and logs the serialized result when invoked as the entry file', async () => {
    const log = vi.fn()

    await expect(
      runIfDirectRun({
        process: { argv: ['/usr/bin/node', '/tmp/research/cli.ts', 'refresh', 'stale'] },
        currentUrl: 'file:///tmp/research/cli.ts',
        log,
      }),
    ).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ ok: true, action: 'refresh', scope: 'stale' }),
    )
  })

  it('does nothing when the module is imported instead of run directly', async () => {
    const log = vi.fn()

    await expect(
      runIfDirectRun({
        process: { argv: ['/usr/bin/node', '/tmp/research/other.ts', 'refresh'] },
        currentUrl: 'file:///tmp/research/cli.ts',
        log,
      }),
    ).resolves.toBeUndefined()

    expect(log).not.toHaveBeenCalled()
  })
})
