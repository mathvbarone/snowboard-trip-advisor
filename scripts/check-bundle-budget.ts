// scripts/check-bundle-budget.ts — pure analysis of `rollup-plugin-visualizer`
// JSON output. Reports the gzip total of the initial-load chunk closure
// (every meta reachable from an entry via static imports only) against the
// 100 KiB advisory budget from spec §6.7.
//
// Spec ref: §7.12 (PR 3.6 deliverable), §6.7 (bundle accounting). Warn-mode
// today; Epic 6 follow-up flips the same byte total to error mode.
//
// Side-effect entry point lives in `./check-bundle-budget.cli.ts`.

interface ModuleImport {
  readonly uid: string
  readonly dynamic?: boolean
}

interface ModuleMeta {
  readonly id: string
  readonly isEntry?: boolean
  readonly imported: readonly ModuleImport[]
  readonly importedBy: readonly ModuleImport[]
  readonly moduleParts: Readonly<Record<string, string>>
  readonly isExternal?: boolean
}

interface ModulePart {
  readonly metaUid: string
  readonly renderedLength: number
  readonly gzipLength: number
  readonly brotliLength: number
}

export interface VisualizerStats {
  readonly version: number
  readonly nodeMetas: Readonly<Record<string, ModuleMeta>>
  readonly nodeParts: Readonly<Record<string, ModulePart>>
}

export interface BudgetCheckResult {
  readonly totalBytes: number
  readonly exceedsBudget: boolean
  readonly warning: string | null
}

export const BUNDLE_BUDGET_BYTES = 100 * 1024

export function checkBundleBudget(data: VisualizerStats): BudgetCheckResult {
  const reachable = new Set<string>()
  const queue: string[] = []
  for (const [uid, meta] of Object.entries(data.nodeMetas)) {
    if (meta.isEntry === true) {
      queue.push(uid)
    }
  }
  while (queue.length > 0) {
    const uid = queue.shift()
    if (uid === undefined || reachable.has(uid)) {
      continue
    }
    reachable.add(uid)
    const meta = data.nodeMetas[uid]
    if (meta === undefined) {
      continue
    }
    for (const imp of meta.imported) {
      if (imp.dynamic === true) {
        continue
      }
      queue.push(imp.uid)
    }
  }
  let totalBytes = 0
  for (const part of Object.values(data.nodeParts)) {
    if (reachable.has(part.metaUid)) {
      totalBytes += part.gzipLength
    }
  }
  const exceedsBudget = totalBytes > BUNDLE_BUDGET_BYTES
  const warning = exceedsBudget
    ? `WARN: initial chunk gzip = ${(totalBytes / 1024).toFixed(1)} KB exceeds 100 KB advisory budget`
    : null
  return { totalBytes, exceedsBudget, warning }
}
