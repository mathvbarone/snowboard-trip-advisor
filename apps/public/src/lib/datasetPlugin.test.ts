import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  copyDataset,
  serveDatasetMiddleware,
  type DatasetMiddlewareNext,
  type DatasetMiddlewareReq,
  type DatasetMiddlewareRes,
} from './datasetPlugin'

interface CapturedRes extends DatasetMiddlewareRes {
  readonly headers: Record<string, string>
  readonly chunks: Buffer[]
  readonly endedPromise: Promise<void>
}

function makeRes(): CapturedRes {
  const headers: Record<string, string> = {}
  const chunks: Buffer[] = []
  let resolveEnded: () => void = (): void => undefined
  const endedPromise = new Promise<void>((r): void => {
    resolveEnded = r
  })
  return {
    headers,
    chunks,
    endedPromise,
    setHeader(name: string, value: string): void {
      headers[name] = value
    },
    end(buf?: Buffer | string): void {
      if (buf !== undefined) {
        chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
      }
      resolveEnded()
    },
  }
}

const stubReq: DatasetMiddlewareReq = { url: '/data/current.v1.json' }

describe('serveDatasetMiddleware', (): void => {
  let workDir: string

  beforeEach(async (): Promise<void> => {
    workDir = await mkdtemp(join(tmpdir(), 'dataset-mw-'))
  })

  afterEach(async (): Promise<void> => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('serves the file with JSON content-type and no-cache (matches §10.2 nginx contract)', async (): Promise<void> => {
    const fixturePath = join(workDir, 'current.v1.json')
    const payload = '{"resorts":[]}'
    await writeFile(fixturePath, payload, 'utf8')
    const middleware = serveDatasetMiddleware(fixturePath)
    const res = makeRes()
    const next = vi.fn<DatasetMiddlewareNext>()

    middleware(stubReq, res, next)
    await res.endedPromise

    expect(res.headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(res.headers['Cache-Control']).toBe('no-cache')
    expect(Buffer.concat(res.chunks).toString('utf8')).toBe(payload)
    expect(next).not.toHaveBeenCalled()
  })

  it('forwards readFile errors via next(err) (ENOENT path)', async (): Promise<void> => {
    const middleware = serveDatasetMiddleware(join(workDir, 'missing.json'))
    const res = makeRes()
    const seen = await new Promise<unknown>((resolveTest): void => {
      middleware(stubReq, res, (err?: unknown): void => {
        resolveTest(err)
      })
    })
    expect(seen).toBeInstanceOf(Error)
    expect(res.chunks.length).toBe(0)
  })
})

describe('copyDataset', (): void => {
  let workDir: string

  beforeEach(async (): Promise<void> => {
    workDir = await mkdtemp(join(tmpdir(), 'dataset-copy-'))
  })

  afterEach(async (): Promise<void> => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('copies the source file to a nested destination, creating parent dirs', async (): Promise<void> => {
    const src = join(workDir, 'src.json')
    const payload = '{"hello":"world"}'
    await writeFile(src, payload, 'utf8')

    const dest = join(workDir, 'nested', 'sub', 'out.json')
    await copyDataset(src, dest)

    const copied = await readFile(dest, 'utf8')
    expect(copied).toBe(payload)
  })
})
