// Stub — PR 3.6 fills in `window.scrollTo(0, 0)` on `view` transitions
// (spec §6.1, line 244). PR 3.1c just exports the symbol so App.tsx can
// import it without coupling to the unimplemented effect.
export function useScrollReset(): void {
  /* intentionally empty — PR 3.6 */
}
