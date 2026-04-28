// Pure helpers backing the dev/build dataset plugin in vite.config.ts.
//
// `serveDatasetMiddleware` is a connect-style middleware factory that
// reads the published dataset from disk on each request and emits the
// same JSON content-type / no-cache headers that the Epic 6 nginx
// edge will serve in prod (spec §10.2). Keeping dev/prod headers
// identical removes a class of "works in dev, breaks in prod" bugs
// around fetch caching and content-type sniffing.
//
// `copyDataset` is the build-time analog: at `writeBundle` time we
// copy the same source file into the output bundle so the static
// site has the dataset alongside its hashed asset chunks.
//
// Both helpers are extracted so they can be unit-tested directly;
// the 5-line Vite lifecycle adapters that wire them are coverage-
// excluded in vite.config.ts.

import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

// Connect-style middleware shape, narrowed to what we actually use.
// We intentionally do not pull in `connect`/`http` types here so the
// helper stays portable and easy to stub in unit tests. `url` is
// declared with `?:` (not `: string | undefined`) to stay
// structurally compatible with Node's `IncomingMessage` under
// `exactOptionalPropertyTypes`.
export interface DatasetMiddlewareReq {
  readonly url?: string | undefined
}

export interface DatasetMiddlewareRes {
  setHeader: (name: string, value: string) => void
  end: (chunk?: Buffer | string) => void
}

export type DatasetMiddlewareNext = (err?: unknown) => void

export type DatasetMiddleware = (
  req: DatasetMiddlewareReq,
  res: DatasetMiddlewareRes,
  next: DatasetMiddlewareNext,
) => void

export function serveDatasetMiddleware(srcPath: string): DatasetMiddleware {
  return (_req, res, next): void => {
    void readFile(srcPath).then(
      (buf): void => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(buf)
      },
      (err: unknown): void => {
        next(err)
      },
    )
  }
}

export async function copyDataset(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(src, dest)
}
