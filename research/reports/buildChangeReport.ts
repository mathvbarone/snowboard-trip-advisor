type Change = {
  id: string
  fields: string[]
}

function valueChanged(previous: unknown, next: unknown) {
  return JSON.stringify(previous) !== JSON.stringify(next)
}

export function buildChangeReport(
  previous: Array<Record<string, unknown>>,
  next: Array<Record<string, unknown>>,
) {
  const previousById = new Map(previous.map((record) => [String(record.id), record]))
  const nextIds = new Set(next.map((record) => String(record.id)))

  const changes = next.flatMap((record) => {
    const id = String(record.id)
    const prior = previousById.get(id)

    if (!prior) {
      return [{ id, fields: ['created'] }]
    }

    const fieldNames = new Set([
      ...Object.keys(prior).filter((key) => key !== 'id'),
      ...Object.keys(record).filter((key) => key !== 'id'),
    ])
    const fields = [...fieldNames].filter((key) =>
      valueChanged(prior[key], record[key]),
    )

    return fields.length ? [{ id, fields }] : []
  })
  const removals = previous
    .filter((record) => !nextIds.has(String(record.id)))
    .map((record) => ({ id: String(record.id), fields: ['removed'] }))

  return {
    json: { changes: [...changes, ...removals] },
    markdown: [...changes, ...removals]
      .map((change) => `- ${change.id}: ${change.fields.join(', ')}`)
      .join('\n'),
  }
}
