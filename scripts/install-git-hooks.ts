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

function reasonFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
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
