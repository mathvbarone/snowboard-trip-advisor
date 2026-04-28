import { readFile } from 'node:fs/promises'

import { loadResortDatasetFromObject, type LoadOptions, type LoadResult } from './loadResortDatasetFromObject'

export { FRESHNESS_TTL_DAYS, type LoadOptions, type LoadResult } from './loadResortDatasetFromObject'

// Node-only wrapper. Reads + JSON.parse the file at `path`, then delegates to
// the pure browser-safe loadResortDatasetFromObject. Imports node:fs/promises;
// banned from apps/public/** by ESLint (see eslint.config.js + spec §2.2).
export async function loadResortDataset(
  path: string,
  opts: LoadOptions = {},
): Promise<LoadResult> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
  return loadResortDatasetFromObject(raw, opts)
}
