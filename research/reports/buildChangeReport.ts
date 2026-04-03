type Change = {
  id: string
  fields: string[]
}

export type ChangeRecord = { id: string } & Record<string, unknown>

type ChangeReport = {
  json: {
    changes: Change[]
  }
  markdown: string
}

function valueChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next)
}

export function buildChangeReport(
  previous: ChangeRecord[],
  next: ChangeRecord[],
): ChangeReport {
  const previousById = new Map(previous.map((record) => [record.id, record]))
  const nextIds = new Set(next.map((record) => record.id))

  const changes: Change[] = next.flatMap((record) => {
    const prior = previousById.get(record.id)

    if (!prior) {
      return [{ id: record.id, fields: ['created'] }]
    }

    const fieldNames = new Set([
      ...Object.keys(prior).filter((key) => key !== 'id'),
      ...Object.keys(record).filter((key) => key !== 'id'),
    ])
    const fields = [...fieldNames].filter((key) =>
      valueChanged(prior[key], record[key]),
    )

    return fields.length ? [{ id: record.id, fields }] : []
  })
  const removals: Change[] = previous
    .filter((record) => !nextIds.has(record.id))
    .map((record) => ({ id: record.id, fields: ['removed'] }))

  return {
    json: { changes: [...changes, ...removals] },
    markdown: [...changes, ...removals]
      .map((change) => `- ${change.id}: ${change.fields.join(', ')}`)
      .join('\n'),
  }
}
