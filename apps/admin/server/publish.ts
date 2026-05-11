import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { basename, join } from 'node:path'

import type { Resort, ResortLiveSignal } from '@snowboard-trip-advisor/schema'
import { ISODateTimeString, WorkspaceFile } from '@snowboard-trip-advisor/schema'
import type {
  PublishBody,
  PublishResponse,
  PublishSlugParam,
} from '@snowboard-trip-advisor/schema/api'
import { publishDataset } from '@snowboard-trip-advisor/schema/node'

import type { HandlerDeps } from './listResorts'
import { readPublishedDocOrNull } from './workspace'

export interface PublishInput {
  readonly params: PublishSlugParam
  readonly body: PublishBody
}

// Coded-error shape thrown to the dispatcher (apps/admin/server/dispatch.ts).
// Mirrors the WorkspaceCorruptError + ad-hoc coded errors used elsewhere.
type CodedError = Error & { code: string; details: unknown }

function codedError(code: string, message: string, details: unknown): CodedError {
  const err = new Error(message) as CodedError
  err.code = code
  err.details = details
  return err
}

export async function publishHandler(
  input: PublishInput,
  deps: HandlerDeps,
): Promise<PublishResponse> {
  // Decision B2: Phase 1 publish is all-or-nothing. Per-slug calls land in
  // Phase 2; the handler explicitly refuses to avoid silent surprises if a
  // curl bypass of the dialog tries `/api/resorts/<slug>/publish`.
  if (input.params.slug !== '__all__') {
    throw codedError(
      'invalid-request',
      'per-slug publish is Phase 2',
      { reason: 'per-slug publish is Phase 2 — Phase 1 publish is all-or-nothing.' },
    )
  }

  // Round-3 P1 fold: compose BOTH resorts AND live_signals from workspace ∪
  // published, then build the full PublishedDataset envelope per
  // packages/schema/src/published.ts:12-22 (schema_version, published_at,
  // resorts, live_signals, manifest).
  const { resorts, live_signals } = await composePublishInput(deps.workspaceRoot)

  // Round-6 P2 fold: HandlerDeps has no clock seam — match the existing
  // listResorts.ts:57 / health.ts:63 pattern (`new Date()` directly).
  // Tests use vi.setSystemTime() for deterministic timestamps. The brand is
  // applied via ISODateTimeString.parse so the PublishResponse / Published
  // Dataset types accept it without an `as` cast.
  const publishedAt = ISODateTimeString.parse(new Date().toISOString())

  const result = await publishDataset(
    {
      schema_version: 1,
      published_at: publishedAt,
      resorts,
      live_signals,
      manifest: {
        resort_count: resorts.length,
        // Round-22 P2 fold: per spec §4.5.1 `manifest.generated_by` carries a
        // per-host fingerprint so PublishHistory can show per-host provenance.
        // Hardcoding 'admin-workspace' alone collapsed every archive's
        // `published_by` to one value, losing the host signal.
        generated_by: computeGeneratedBy(),
        validator_version: '1',
      },
    },
    { rootDir: join(deps.workspaceRoot, 'data', 'published') },
  )

  if (!result.ok) {
    throw codedError(
      'publish-validation-failed',
      'publish-validation-failed',
      { issues: result.issues },
    )
  }

  return {
    // Round-4 P2 fold: derive version_id from the archive path returned by
    // publishDataset() (the authoritative source). Reconstructing from our own
    // `new Date()` would mismatch the filename publishDataset wrote (because
    // publishDataset calls `new Date()` internally for its filename), and
    // listPublishesHandler later identifies archives by filename — the success
    // Toast would point at one version_id and the PublishHistory row at
    // another.
    version_id: basename(result.archive_path, '.json'),
    archive_path: result.archive_path,
    published_at: publishedAt,
    resort_count: resorts.length,
  }
}

interface ComposeResult {
  readonly resorts: Resort[]
  readonly live_signals: ResortLiveSignal[]
}

// Decision B3: inline in publish.ts — locality of behaviour, not extracted to
// its own file. Tested through publishHandler's unit tests.
async function composePublishInput(workspaceRoot: string): Promise<ComposeResult> {
  const workspaceDir = join(workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(workspaceRoot, 'data', 'published', 'current.v1.json')

  // Match existing handlers: mkdir -p the workspace dir so listdir doesn't
  // ENOENT on cold start. dispatch.ts already ensures this, but a future
  // caller path (or test rig) shouldn't break here.
  await mkdir(workspaceDir, { recursive: true })

  const workspaceResorts = new Map<string, Resort>()
  const workspaceLive = new Map<string, ResortLiveSignal>()
  // Round-6 P2 fold: track which slugs have a workspace entry SEPARATELY from
  // which workspace entries had a non-null live_signal. A workspace file with
  // explicit `live_signal: null` is intentional (resortUpsert.ts supports it);
  // without this set, the merge below would fall back to the published
  // live_signal and silently resurrect data the analyst cleared.
  const workspaceSlugsWithEntry = new Set<string>()

  // `mkdir(..., { recursive: true })` above guarantees the directory exists,
  // so `readdir` cannot ENOENT here. Other errors (EACCES, EIO) propagate to
  // the dispatcher's 500 envelope — defensive behaviour matches health.ts /
  // listResorts.ts and is structurally unreachable in unit tests without
  // OS-level injection.
  const workspaceEntries = await readdir(workspaceDir)

  for (const entry of workspaceEntries) {
    if (!entry.endsWith('.json')) {
      continue
    }
    const filePath = join(workspaceDir, entry)
    const slugFromName = entry.replace(/\.json$/, '')
    // readFile here can throw ENOENT (TOCTOU between readdir and readFile)
    // or EACCES/EIO. Both are operationally fs-level failures the operator
    // should see — let them propagate to the 500 envelope at dispatch.ts.
    // Coverage-wise these are structurally unreachable in unit tests without
    // injecting fs failures mid-loop; the existing handlers (listResorts.ts,
    // workspace.ts) handle the same way.
    const text = await readFile(filePath, 'utf-8')
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (e: unknown) {
      // Round-1 P1 fold: per spec §10.3.1, publish MUST refuse when any
      // workspace file is corrupt — the dialog's pre-publish gate is a UX
      // affordance, not load-bearing safety. Silently skipping would let a
      // curl bypass of the dialog drop the staged corrupt slug from the
      // snapshot.
      // JSON.parse only throws SyntaxError (which extends Error) per the
      // ECMAScript spec — the `instanceof Error` branch is exhaustive in
      // practice, so the false-branch is structurally unreachable.
      /* v8 ignore next 4 -- false branch of `e instanceof Error` requires
         a non-Error throw from JSON.parse, which the spec rules out. */
      const reason = e instanceof Error ? e.message : 'invalid JSON'
      throw codedError(
        'workspace-corrupt',
        `workspace file ${entry} is not valid JSON`,
        { slug: slugFromName, reason },
      )
    }
    const parsed = WorkspaceFile.safeParse(raw)
    if (!parsed.success) {
      throw codedError(
        'workspace-corrupt',
        `workspace file ${entry} failed schema validation`,
        {
          slug: slugFromName,
          issues: parsed.error.issues,
        },
      )
    }
    // Round-31 P2 fold: spec §10.3.1 narrowly defines "corrupt" as files that
    // fail `WorkspaceFile.parse()`. health.ts:65-74 honors that narrow
    // definition and does NOT count filename↔embedded-slug drift. Round-30
    // proposed adding a drift check here mirroring workspace.readWorkspace
    // FileForSlug:84, but if publish rejected drift while health didn't, the
    // PublishDialog's `resorts_with_corrupt_workspace === 0` check would
    // enable Confirm even though POST would deterministically fail. Trust the
    // embedded slug here; drift is surfaced via the editor's single-file read
    // path.
    workspaceResorts.set(parsed.data.slug, parsed.data.resort)
    workspaceSlugsWithEntry.add(parsed.data.slug)
    if (parsed.data.live_signal !== null) {
      workspaceLive.set(parsed.data.slug, parsed.data.live_signal)
    }
    // If parsed.data.live_signal === null, intentionally do NOT populate
    // workspaceLive; the merge below uses workspaceSlugsWithEntry to detect
    // the explicit-clear case and skip the published fallback.
  }

  // Round-29 P2 fold: use the canonical readPublishedDocOrNull helper
  // (apps/admin/server/workspace.ts:109) which returns null on ENOENT,
  // malformed JSON, and schema-parse failure (all spec §10.9 cold-start
  // equivalents), and rethrows fs errors. Matches health.ts and listResorts.ts.
  const publishedDoc = await readPublishedDocOrNull(publishedPath)
  const publishedResorts: ReadonlyArray<Resort> = publishedDoc?.resorts ?? []
  const publishedLive: ReadonlyArray<ResortLiveSignal> = publishedDoc?.live_signals ?? []

  // Merge resorts: workspace overrides per slug; published-only kept.
  const mergedResorts: Resort[] = []
  const consumedSlugs = new Set<string>()
  for (const r of publishedResorts) {
    mergedResorts.push(workspaceResorts.get(r.slug) ?? r)
    consumedSlugs.add(r.slug)
  }
  for (const [slug, r] of workspaceResorts.entries()) {
    if (!consumedSlugs.has(slug)) {
      mergedResorts.push(r)
    }
  }

  // Merge live_signals: workspace's intent wins. If a slug has a workspace
  // entry (per workspaceSlugsWithEntry), use its live_signal value (which may
  // be null → omit from merged list; explicit clear). Only fall back to the
  // published live_signal when the slug has NO workspace entry at all.
  // (Round-6 P2 fold.)
  const publishedLiveBySlug = new Map<string, ResortLiveSignal>(
    publishedLive.map((ls): [string, ResortLiveSignal] => [ls.resort_slug, ls]),
  )
  const mergedLive: ResortLiveSignal[] = []
  for (const r of mergedResorts) {
    if (workspaceSlugsWithEntry.has(r.slug)) {
      const ws = workspaceLive.get(r.slug)
      if (ws !== undefined) {
        mergedLive.push(ws)
      }
      // else: workspace had this slug but with live_signal: null → cleared.
    } else {
      const pub = publishedLiveBySlug.get(r.slug)
      if (pub !== undefined) {
        mergedLive.push(pub)
      }
    }
  }

  return { resorts: mergedResorts, live_signals: mergedLive }
}

// Round-22 P2 fold: per spec §4.5.1, `manifest.generated_by` is
// "<cli-identifier> host=<sha256(hostname)>". For Phase 1 loopback admin the
// cli-identifier is the admin-app label; the host fingerprint is sha256 of
// the OS hostname (not PII — irreversible).
function computeGeneratedBy(): string {
  const hostHash = createHash('sha256').update(hostname()).digest('hex')
  return `admin-workspace host=${hostHash}`
}
