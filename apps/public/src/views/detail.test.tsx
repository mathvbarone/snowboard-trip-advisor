import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import DetailDrawer from './detail'

describe('DetailDrawer (frozen stub — body lands in PR 3.5)', (): void => {
  it('throws on render with the spec-§5.5 deferred message', (): void => {
    const slug = ResortSlug.parse('kotelnica-bialczanska')
    expect((): void => {
      DetailDrawer({ slug })
    }).toThrow('detail route stub — lands in PR 3.5')
  })
})
