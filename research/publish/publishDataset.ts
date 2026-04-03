import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validatePublishedDataset } from '../validate/validatePublishedDataset'

export function buildVersionId(date: Date) {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
}

export async function publishDataset(dataset: unknown, rootDir: string) {
  const validated = validatePublishedDataset(dataset)
  const datasetPath = path.join(
    rootDir,
    'data/published/versions',
    validated.version,
    'dataset.json',
  )
  const manifestPath = path.join(rootDir, 'data/published/manifest.json')
  const currentDatasetPath = path.join(rootDir, 'data/published/current.json')
  const serialized = JSON.stringify(validated, null, 2)

  await mkdir(path.dirname(datasetPath), { recursive: true })
  await writeFile(datasetPath, serialized)
  await writeFile(currentDatasetPath, serialized)
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        currentVersion: validated.version,
        currentPath: '/data/published/current.json',
      },
      null,
      2,
    ),
  )
}
