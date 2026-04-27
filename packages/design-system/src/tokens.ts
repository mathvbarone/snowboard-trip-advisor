// Design tokens — single source of truth.
//
// `tokens.css` is generated from this file by `scripts/generate-tokens.ts`.
// Hand-edits to `tokens.css` are rejected by the pre-commit hook + the
// `npm run tokens:check` step in CI: edit this file and re-run
// `npm run tokens:generate` instead.
//
// Spec ref: §6.1 (tokens), §6.2 (4pt spacing scale), §2.7 (typography
// family names — actual @fontsource wiring lands in Epic 3 PR 3.1).
export const tokens = {
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
    '4xl': 64,
  },
  breakpoint: { xs: 360, sm: 600, md: 900, lg: 1280 },
  radius: { sm: 4, md: 8, lg: 12, pill: 9999 },
  zIndex: { drawer: 50, modal: 60, toast: 70, tooltip: 80 },
  duration: { fast: 120, base: 180, slow: 280 },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  // TODO(epic-3): consider rem-based font sizes for user-font-size honoring (a11y).
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, '2xl': 32 },
  font: {
    family: {
      display: '"DM Serif Display", serif',
      body: '"DM Sans", system-ui, sans-serif',
      numeric: '"JetBrains Mono", ui-monospace, monospace',
    },
  },
  color: {
    light: {
      background: '#ffffff',
      foreground: '#0b0d10',
      muted: '#5a6166',
      accent: '#0066cc',
      success: '#117a3d',
      warning: '#a86200',
      danger: '#b22222',
      surface: '#f4f5f7',
      border: '#d6d9dd',
    },
    dark: {
      background: '#0b0d10',
      foreground: '#f4f5f7',
      muted: '#9aa0a6',
      accent: '#5aa6ff',
      success: '#46c47e',
      warning: '#f5b347',
      danger: '#ff6b6b',
      surface: '#15181d',
      border: '#2c3137',
    },
  },
} as const
