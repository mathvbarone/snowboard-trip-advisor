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

export function parseCommand(args: string[]): Command {
  const [action = '', scope = 'all'] = args

  return {
    action,
    scope,
  }
}

export async function runCli(args: string[]) {
  const command = parseCommand(args)

  if (command.action === 'refresh') return { ok: true, ...command }
  if (command.action === 'publish') return { ok: true, ...command }

  throw new Error(`Unknown command: ${command.action}`)
}

if (process && import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).then((result) => {
    console.log(JSON.stringify(result))
  })
}
