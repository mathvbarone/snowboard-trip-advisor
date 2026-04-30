export interface CheckAgentDisciplineSyncOptions {
  repoRoot?: string
}

export function checkAgentDisciplineSync(
  options?: CheckAgentDisciplineSyncOptions,
): Promise<string[]>

export interface RunCheckAgentDisciplineSyncOptions extends CheckAgentDisciplineSyncOptions {
  stderr?: {
    write(chunk: string): unknown
  }
  exit?: (code: number) => void
}

export function runCheckAgentDisciplineSync(
  options?: RunCheckAgentDisciplineSyncOptions,
): Promise<string[]>
