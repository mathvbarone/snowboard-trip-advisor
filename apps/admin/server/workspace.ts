import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Phase 1 lazy-create per spec §10.9 — matches publishDataset.ts:30's pattern
// for data/published/history/. mkdir -p semantics, idempotent.
export async function ensureWorkspaceDir(root: string): Promise<void> {
  await mkdir(join(root, 'data', 'admin-workspace'), { recursive: true })
}
