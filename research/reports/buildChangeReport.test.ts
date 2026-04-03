import { describe, expect, it } from 'vitest'
import { buildChangeReport } from './buildChangeReport'

describe('buildChangeReport', () => {
  it('compares records by resort id instead of array index', () => {
    const report = buildChangeReport(
      [
        { id: 'a', lift_pass_day_eur: 40 },
        { id: 'b', lift_pass_day_eur: 80 },
      ],
      [
        { id: 'b', lift_pass_day_eur: 81 },
        { id: 'a', lift_pass_day_eur: 40 },
      ],
    )

    expect(report.json.changes).toEqual([
      { id: 'b', fields: ['lift_pass_day_eur'] },
    ])
  })

  it('reports removed resorts', () => {
    const report = buildChangeReport(
      [
        { id: 'a', lift_pass_day_eur: 40 },
        { id: 'b', lift_pass_day_eur: 80 },
      ],
      [{ id: 'a', lift_pass_day_eur: 40 }],
    )

    expect(report.json.changes).toEqual([{ id: 'b', fields: ['removed'] }])
    expect(report.markdown).toContain('b: removed')
  })
})
