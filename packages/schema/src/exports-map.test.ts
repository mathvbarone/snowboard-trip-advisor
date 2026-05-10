import { describe, expect, it } from 'vitest'

import pkg from '../package.json' with { type: 'json' }

import * as nodeExports from './node'

interface PackageJsonExports {
  readonly exports: Record<string, string>
}

const exports = (pkg as unknown as PackageJsonExports).exports

describe('packages/schema exports map (PR 4.0)', (): void => {
  it('declares the ./api subpath (resolves once PR 4.1a lands api/index.ts)', (): void => {
    expect(exports['./api']).toBe('./api/index.ts')
  })

  it('still declares . and ./node', (): void => {
    expect(exports['.']).toBe('./src/index.ts')
    expect(exports['./node']).toBe('./src/node.ts')
  })

  it('re-exports atomicWriteText from /node (PR 4.4c §B1)', (): void => {
    // PR 4.4c needs apps/admin/server's atomicWriteWorkspaceFile to import the
    // canonical atomicWriteText impl from packages/schema/node rather than
    // copy-paste the fsync→rename→fsync sequence (which would risk drift on
    // the macOS-APFS EBADF tolerance + tmp-cleanup branches that publishDataset
    // already proved out). node.ts already does `export * from './publishDataset'`,
    // so flipping atomicWriteText to `export async function ...` is a 1-line
    // surface widening; this assertion pins it.
    expect(typeof (nodeExports as { atomicWriteText?: unknown }).atomicWriteText).toBe('function')
  })
})
