import type { JSX } from 'react'

// Frozen-stub mirror of detail.tsx. PR 3.4 fills the body with the real
// matrix implementation; App.tsx's lazy import works as soon as the file
// exists. Today the throw makes a premature render visible.
export default function MatrixView(): JSX.Element {
  throw new Error('matrix route stub — lands in PR 3.4')
}
