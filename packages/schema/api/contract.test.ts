import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import * as api from './index'

interface SerializedExport {
  readonly name: string
  readonly jsonSchema: unknown
}

function serializeExport(name: string, value: unknown): SerializedExport {
  if (value !== null && typeof value === 'object' && '_zod' in value) {
    return { name, jsonSchema: z.toJSONSchema(value as z.ZodType) }
  }
  if (value !== null && typeof value === 'object') {
    return { name, jsonSchema: JSON.parse(JSON.stringify(value)) as unknown }
  }
  return { name, jsonSchema: { kind: 'non-object', typeof: typeof value } }
}

describe('schema/api contract snapshot (PR 4.1a, spec §4.9 invariant 3)', (): void => {
  it('captures every export from index.ts (regression gate — diffs require maintainer review)', (): void => {
    const exports = Object.entries(api)
      .map(([name, value]): SerializedExport => serializeExport(name, value))
      .sort((a, b): number => a.name.localeCompare(b.name))
    expect(exports).toMatchSnapshot()
  })
})
