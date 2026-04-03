declare const process:
  | {
      argv: string[]
    }
  | undefined

export interface Command {
  action: string
  scope: CommandScope
}

export type CommandScope = string
export type CliResult = Command & {
  ok: true
}

export function parseCommand(args: string[]): Command {
  const [action = '', scope = 'all'] = args

  return {
    action,
    scope,
  }
}

export function runCli(args: string[]): Promise<CliResult> {
  const command = parseCommand(args)

  if (command.action === 'refresh') {
    return Promise.resolve({ ok: true, ...command })
  }
  if (command.action === 'publish') {
    return Promise.resolve({ ok: true, ...command })
  }

  return Promise.reject(new Error(`Unknown command: ${command.action}`))
}

type CliRuntime = {
  process:
    | {
        argv: string[]
      }
    | undefined
  currentUrl: string
  log?: (message: string) => void
}

export async function runIfDirectRun({
  process: runtimeProcess,
  currentUrl,
  log = console.log,
}: CliRuntime): Promise<void> {
  if (
    runtimeProcess === undefined ||
    currentUrl !== `file://${runtimeProcess.argv[1]}`
  ) {
    return
  }

  const result = await runCli(runtimeProcess.argv.slice(2))
  log(JSON.stringify(result))
}

void runIfDirectRun({
  process,
  currentUrl: import.meta.url,
})
