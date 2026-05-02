import { describe, expect, it } from 'vitest'

import vitestConfig from '../vitest.config'

interface CoverageInclude {
  readonly include?: readonly string[]
}

const include = (vitestConfig.test?.coverage as CoverageInclude | undefined)?.include ?? []

describe('vitest.config.ts coverage.include (PR 4.0)', (): void => {
  it.each([
    'apps/admin/server/**',
    'apps/admin/vite-plugin-admin-api.ts',
    'packages/schema/api/**',
  ])('includes %s for the 100-percent coverage gate', (path: string): void => {
    expect(include).toContain(path)
  })

  it('keeps the existing entries (regression guard)', (): void => {
    expect(include).toEqual(expect.arrayContaining([
      'apps/*/src/**',
      'packages/*/src/**',
      'scripts/**',
      'config/**',
      'tests/integration/**',
    ]))
  })
})
