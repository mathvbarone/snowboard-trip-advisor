import { useCallback, useState } from 'react'
import type { z } from 'zod'

// Generic localStorage-backed state hook.
//
// Reads on mount via `safeParse`; falls back to the supplied default when the
// key is missing, the stored payload is not valid JSON, or the parsed object
// does not match the schema. The setter writes the new value back to
// localStorage as JSON.
//
// Browser-only: throws if `window` is undefined. apps/public is only ever
// rendered in jsdom (tests) or a real browser, so the check is enforced
// implicitly — callers do not need to guard.
export function useLocalStorageState<T>(
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>((): T => readInitial(key, schema, defaultValue))

  const set = useCallback(
    (next: T): void => {
      window.localStorage.setItem(key, JSON.stringify(next))
      setValue(next)
    },
    [key],
  )

  return [value, set]
}

function readInitial<T>(key: string, schema: z.ZodType<T>, defaultValue: T): T {
  const raw = window.localStorage.getItem(key)
  if (raw === null) {
    return defaultValue
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultValue
  }
  const result = schema.safeParse(parsed)
  return result.success ? result.data : defaultValue
}
