// scripts/generate-tokens.ts — pure renderer for the design-system token CSS.
//
// Source of truth: `packages/design-system/src/tokens.ts`. The CLI entry point
// that materializes `packages/design-system/tokens.css` lives in
// `scripts/generate-tokens.cli.ts` so this file stays a side-effect-free,
// fully-covered pure function.
//
// Spec ref: §6.1 (tokens), §6.2 (4pt spacing scale).

import type { tokens as Tokens } from '../packages/design-system/src/tokens'

export const GENERATED_HEADER =
  '/* GENERATED — do not edit; edit tokens.ts and run npm run tokens:generate */'

export function renderTokensCss(t: typeof Tokens): string {
  const lines: string[] = [GENERATED_HEADER, '', ':root {']
  for (const [k, v] of Object.entries(t.space)) {
    lines.push(`  --space-${k}: ${String(v)}px;`)
  }
  for (const [k, v] of Object.entries(t.breakpoint)) {
    lines.push(`  --breakpoint-${k}: ${String(v)}px;`)
  }
  for (const [k, v] of Object.entries(t.radius)) {
    lines.push(`  --radius-${k}: ${String(v)}px;`)
  }
  for (const [k, v] of Object.entries(t.zIndex)) {
    lines.push(`  --z-${k}: ${String(v)};`)
  }
  for (const [k, v] of Object.entries(t.duration)) {
    lines.push(`  --duration-${k}: ${String(v)}ms;`)
  }
  for (const [k, v] of Object.entries(t.fontWeight)) {
    lines.push(`  --font-weight-${k}: ${String(v)};`)
  }
  for (const [k, v] of Object.entries(t.fontSize)) {
    lines.push(`  --font-size-${k}: ${String(v)}px;`)
  }
  for (const [k, v] of Object.entries(t.font.family)) {
    lines.push(`  --font-family-${k}: ${v};`)
  }
  for (const [k, v] of Object.entries(t.color.light)) {
    lines.push(`  --color-${k}: ${v};`)
  }
  lines.push('}')
  lines.push('', '[data-theme="dark"] {')
  for (const [k, v] of Object.entries(t.color.dark)) {
    lines.push(`  --color-${k}: ${v};`)
  }
  lines.push('}', '')
  return lines.join('\n')
}
