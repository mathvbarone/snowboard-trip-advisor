// scripts/install-git-hooks.ts — pure orchestrator that installs tracked git
// hooks from `scripts/<hook>` into the repo's `.git/hooks/<hook>` directory.
//
// I/O is injected (`ReadFileFn` / `WriteFileFn`) so the unit test can run
// without touching the filesystem; the CLI entry point at
// `./install-git-hooks.cli.ts` wires the real `node:fs/promises` calls.
//
// Idempotent: if the target already contains the source byte-for-byte, the
// installer reports `unchanged` and skips the write. Re-running `npm run setup`
// is therefore a no-op when nothing has drifted.

export interface HookInstallSpec {
  readonly name: string
  readonly sourcePath: string
  readonly targetPath: string
}

export interface HookInstallResult {
  readonly hook: string
  readonly status: 'installed' | 'unchanged' | 'source_missing' | 'write_failed'
  readonly reason?: string
}

export type ReadFileFn = (path: string) => Promise<string>
export type WriteFileFn = (path: string, content: string) => Promise<void>
export type ChmodFn = (path: string, mode: number) => Promise<void>

function reasonFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const HOOK_MODE = 0o755

// Re-assert the executable bit on every successfully-resolved target.
// Defence-in-depth against drift: a contributor who ran `chmod -x` on an
// installed hook would otherwise see `unchanged` on the next `npm run setup`
// while the hook silently fails to fire. Skips targets where the source was
// missing or the write failed (no reliable target path to chmod).
export async function ensureExecutable(
  specs: readonly HookInstallSpec[],
  results: readonly HookInstallResult[],
  chmod: ChmodFn,
): Promise<void> {
  for (const spec of specs) {
    const result = results.find((r): boolean => r.hook === spec.name)
    if (
      result === undefined ||
      result.status === 'source_missing' ||
      result.status === 'write_failed'
    ) {
      continue
    }
    await chmod(spec.targetPath, HOOK_MODE)
  }
}

export async function installHook(
  spec: HookInstallSpec,
  read: ReadFileFn,
  write: WriteFileFn,
): Promise<HookInstallResult> {
  let content: string
  try {
    content = await read(spec.sourcePath)
  } catch (err) {
    return {
      hook: spec.name,
      status: 'source_missing',
      reason: reasonFromError(err),
    }
  }
  let existing: string | null
  try {
    existing = await read(spec.targetPath)
  } catch {
    existing = null
  }
  if (existing === content) {
    return { hook: spec.name, status: 'unchanged' }
  }
  try {
    await write(spec.targetPath, content)
    return { hook: spec.name, status: 'installed' }
  } catch (err) {
    return {
      hook: spec.name,
      status: 'write_failed',
      reason: reasonFromError(err),
    }
  }
}

export async function installHooks(
  specs: readonly HookInstallSpec[],
  read: ReadFileFn,
  write: WriteFileFn,
): Promise<readonly HookInstallResult[]> {
  const results: HookInstallResult[] = []
  for (const spec of specs) {
    results.push(await installHook(spec, read, write))
  }
  return results
}
