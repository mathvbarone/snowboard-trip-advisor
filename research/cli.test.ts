import { describe, expect, it } from 'vitest'
import { parseCommand, runCli } from './cli'

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
