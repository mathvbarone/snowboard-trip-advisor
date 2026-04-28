import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Repo-root-relative path to the published seed dataset. Resolved
// from this file's directory: apps/public/src/mocks → repo root is
// up four segments.
const FIXTURE_PATH = resolve(
  import.meta.dirname,
  '../../../../data/published/current.v1.json',
)

export const server = setupServer(
  http.get('/data/current.v1.json', async (): Promise<HttpResponse<string>> => {
    const buf = await readFile(FIXTURE_PATH, 'utf8')
    return new HttpResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }),
)
