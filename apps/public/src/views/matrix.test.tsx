import { describe, expect, it } from 'vitest'

import MatrixView from './matrix'

describe('MatrixView (frozen stub — body lands in PR 3.4)', (): void => {
  it('throws on render with the spec-§7.7 deferred message', (): void => {
    expect((): void => {
      MatrixView()
    }).toThrow('matrix route stub — lands in PR 3.4')
  })
})
