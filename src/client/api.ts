/**
 * Reads the package's own HTTP route companion from the browser.
 *
 * The panel is a read-only view over what the plugin already recorded, so the
 * client asks the routes the package owns rather than a Cordis service: a
 * browser has no host context to reach one through, and the route companion
 * already publishes exactly these shapes.
 *
 * Every read proves the decoded payload before it is used. A route that answers
 * with a proxy's HTML, an error document, or a shape from a different version
 * must fail as a described error rather than as an `undefined` field rendered
 * somewhere deep in the panel.
 *
 * @module dsh-plugin-system-one/client/api
 */

/** Path prefix the route companion claims. */
const ROUTE_PREFIX = '/api/dsh-plugin-system-one'

/** Path reporting whether the plugin is live and which model it uses. */
const HEALTH_PATH = `${ROUTE_PREFIX}/health`

/** Path reporting cumulative and recent token usage. */
const USAGE_PATH = `${ROUTE_PREFIX}/usage`

/** Path listing the classification options this package ships. */
const CATALOG_PATH = `${ROUTE_PREFIX}/catalog`

/** Method a read uses; every endpoint is read-only. */
const READ_METHOD = 'GET'

/** Aggregate figures over a set of evaluations. */
interface UsageTotals {
  /** Evaluations counted. */ calls: number
  /** Billed input tokens. */ inputTokens: number
  /** Output tokens produced. */ outputTokens: number
  /** Questions asked. */ questions: number
  /** Characters of state submitted. */ stateChars: number
}

/** One recorded evaluation. */
interface UsageEntry {
  /** Epoch milliseconds when the request settled. */ at: number
  /** Tool or surface that issued the request. */ tool: string
  /** Versioned model id that answered. */ model: string
  /** Questions asked in the request. */ questions: number
  /** Characters of state submitted. */ stateChars: number
  /** Billed input tokens. */ inputTokens: number
  /** Output tokens, reported but not billed. */ outputTokens: number
  /** Wall-clock duration in milliseconds. */ durationMs: number
}

/** Cumulative and recent usage, as the route companion reports it. */
interface UsageReport {
  /** Cumulative totals since the instance was created. */ totals: UsageTotals
  /** Cumulative totals per tool. */ byTool: Record<string, UsageTotals>
  /** Most recent evaluations, newest first. */ recent: UsageEntry[]
}

/** Liveness and model, as the route companion reports them. */
interface HealthReport {
  /** Whether the endpoint answered at all. */ ok: boolean
  /** Whether the plugin is configured to contact TypeSafe. */ enabled: boolean
  /** Model id or alias the plugin sends. */ model: string
}

/** One reusable set of classification questions. */
interface CatalogBank {
  /** Stable id used to select the bank. */ id: string
  /** Short human-readable title. */ title: string
  /** Routing copy: when a caller should reach for this bank. */ description: string
  /** Atomic questions keyed by answer id. */ questions: Record<string, unknown>
}

/** Classification options, as the route companion reports them. */
interface CatalogReport {
  /** Banks this build ships. */
  banks: CatalogBank[]
}

/** The reads the usage panel performs. */
interface UsageApi {
  /** Read liveness and the answering model. */ health: () => Promise<HealthReport>
  /** Read cumulative and recent usage. */ usage: () => Promise<UsageReport>
  /** Read the classification options this build ships. */ catalog: () => Promise<CatalogReport>
}

/** The subset of a fetch response this client reads. */
interface FetchResponse {
  /** Whether the status is a success status. */
  ok: boolean
  /** HTTP status, used in the failure message. */
  status: number
  /** Decode the body. */
  json: () => Promise<unknown>
}

/**
 * The subset of `fetch` this client needs.
 *
 * A narrower signature than the platform's is deliberate: it lets a test stand
 * in for the network with a plain function, and it keeps this module from
 * depending on request and response types the host may not provide.
 */
type FetchLike = (path: string) => Promise<FetchResponse>

/**
 * Whether a value is an indexable object.
 *
 * @param value - Candidate value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is a finite number.
 *
 * @param value - Candidate value.
 * @returns True for a finite number.
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Whether a value is an aggregate of counters.
 *
 * @param value - Candidate value.
 * @returns True when every counter is a finite number.
 */
function isTotals(value: unknown): value is UsageTotals {
  if (!isRecord(value)) {
    return false
  }
  return (
    isNumber(value.calls)
    && isNumber(value.inputTokens)
    && isNumber(value.outputTokens)
    && isNumber(value.questions)
    && isNumber(value.stateChars)
  )
}

/**
 * Whether a value maps every tool id to an aggregate.
 *
 * @param value - Candidate value.
 * @returns True when every entry is an aggregate.
 */
function isToolTotals(value: unknown): value is Record<string, UsageTotals> {
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every((entry: unknown) => isTotals(entry))
}

/**
 * Whether a value is one recorded evaluation.
 *
 * @param value - Candidate value.
 * @returns True when the entry carries every field the tables render.
 */
function isEntry(value: unknown): value is UsageEntry {
  if (!isRecord(value)) {
    return false
  }
  return (
    isNumber(value.at)
    && typeof value.tool === 'string'
    && typeof value.model === 'string'
    && isNumber(value.questions)
    && isNumber(value.stateChars)
    && isNumber(value.inputTokens)
    && isNumber(value.outputTokens)
    && isNumber(value.durationMs)
  )
}

/**
 * Whether a value is a usage report.
 *
 * @param value - Candidate value.
 * @returns True when totals, per-tool totals and entries are all sound.
 */
function isUsageReport(value: unknown): value is UsageReport {
  if (!isRecord(value)) {
    return false
  }
  const { recent } = value
  if (!Array.isArray(recent)) {
    return false
  }
  return (
    isTotals(value.totals)
    && isToolTotals(value.byTool)
    && recent.every((entry: unknown) => isEntry(entry))
  )
}

/**
 * Whether a value is a health report.
 *
 * @param value - Candidate value.
 * @returns True when liveness, the switch and the model are all present.
 */
function isHealthReport(value: unknown): value is HealthReport {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.ok === 'boolean'
    && typeof value.enabled === 'boolean'
    && typeof value.model === 'string'
  )
}

/**
 * Whether a value is one question bank.
 *
 * @param value - Candidate value.
 * @returns True when the bank carries the fields the panel shows.
 */
function isCatalogBank(value: unknown): value is CatalogBank {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && isRecord(value.questions)
  )
}

/**
 * Whether a value is a catalog report.
 *
 * @param value - Candidate value.
 * @returns True when every listed bank is sound.
 */
function isCatalogReport(value: unknown): value is CatalogReport {
  if (!isRecord(value)) {
    return false
  }
  const { banks } = value
  if (!Array.isArray(banks)) {
    return false
  }
  return banks.every((bank: unknown) => isCatalogBank(bank))
}

/**
 * Issue one read and prove the decoded payload's shape.
 *
 * @param fetchImpl - The fetch implementation to use.
 * @param path - Absolute path on the host's origin.
 * @param guard - Type guard the decoded payload must satisfy.
 * @returns The decoded payload.
 * @throws {Error} When the request fails or the payload is unrecognized.
 */
async function requestJson<TValue>(
  fetchImpl: FetchLike,
  path: string,
  guard: (value: unknown) => value is TValue,
): Promise<TValue> {
  const response = await fetchImpl(path)
  if (!response.ok) {
    throw new Error(`${path} answered ${String(response.status)}`)
  }
  const payload: unknown = await response.json()
  if (!guard(payload)) {
    throw new Error(`${path} answered an unrecognized payload`)
  }
  return payload
}

/**
 * Issue one same-origin read through the browser's own `fetch`.
 *
 * @param path - Absolute path to read.
 * @returns The raw response.
 */
async function defaultFetch(path: string): Promise<FetchResponse> {
  const response = await fetch(path, { method: READ_METHOD })
  return response
}

/**
 * Bind one proved read to a fetch implementation and a path.
 *
 * @param fetchImpl - The fetch implementation to use.
 * @param path - Absolute path on the host's origin.
 * @param guard - Type guard the decoded payload must satisfy.
 * @returns A zero-argument read.
 */
function reader<TValue>(
  fetchImpl: FetchLike,
  path: string,
  guard: (value: unknown) => value is TValue,
): () => Promise<TValue> {
  return async (): Promise<TValue> => {
    const payload = await requestJson(fetchImpl, path, guard)
    return payload
  }
}

/**
 * Build the usage reads against one fetch implementation.
 *
 * @param fetchImpl - Fetch to use; defaults to the browser's own.
 * @returns The three reads the panel performs.
 */
function createUsageApi(fetchImpl: FetchLike = defaultFetch): UsageApi {
  return {
    health: reader(fetchImpl, HEALTH_PATH, isHealthReport),
    usage: reader(fetchImpl, USAGE_PATH, isUsageReport),
    catalog: reader(fetchImpl, CATALOG_PATH, isCatalogReport),
  }
}

export {
  CATALOG_PATH,
  HEALTH_PATH,
  ROUTE_PREFIX,
  USAGE_PATH,
  createUsageApi,
  isCatalogReport,
  isHealthReport,
  isUsageReport,
  type CatalogBank,
  type CatalogReport,
  type FetchLike,
  type FetchResponse,
  type HealthReport,
  type UsageApi,
  type UsageEntry,
  type UsageReport,
  type UsageTotals,
}
