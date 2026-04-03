import type { z } from 'zod'
import { publishedDatasetSchema } from '../../research/schema'

export type PublishedDataset = z.infer<typeof publishedDatasetSchema>
export type PublishedResort = PublishedDataset['resorts'][number]

export async function loadPublishedDataset(): Promise<PublishedDataset> {
  const response = await fetch('/data/published/current.json')

  if (!response.ok) {
    throw new Error(`Failed to load published dataset: ${response.status}`)
  }

  return publishedDatasetSchema.parse(await response.json())
}
