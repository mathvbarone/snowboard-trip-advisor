export interface InstallHooksOptions {
  repoRoot?: string
  hooksDir?: string
}

export function installHooks(options?: InstallHooksOptions): Promise<void>
