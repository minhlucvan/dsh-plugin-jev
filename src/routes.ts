/**
 * Optional HTTP-route companion for `dsh-plugin-system-one`.
 *
 * The routes expose what the plugin already knows, so a dashboard can render it
 * without asking a model anything: whether the plugin is live, what this
 * session has cost, and which classification options ship with the package. No
 * route accepts a credential or returns one.
 *
 * @module dsh-plugin-system-one/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'

import { BANKS } from './jev/catalog/index.ts'
import { isRecord } from './jev/contracts.ts'
import type { JevService } from './jev/service.ts'

/** Cordis companion plugin name. */
const name = 'jev-routes'

/** Services required before the companion can serve anything. */
const inject = ['webServer', 'jev']

/** Path prefix this package claims. */
const ROUTE_PREFIX = '/api/dsh-plugin-system-one'

/** Path reporting whether the plugin is live and which model it uses. */
const HEALTH_PATH = `${ROUTE_PREFIX}/health`

/** Path reporting cumulative and recent token usage. */
const USAGE_PATH = `${ROUTE_PREFIX}/usage`

/** Path listing the classification options this package ships. */
const CATALOG_PATH = `${ROUTE_PREFIX}/catalog`

/** Recent usage entries a dashboard shows. */
const USAGE_RECENT_LIMIT = 20

/** Status code for a successful read. */
const STATUS_OK = 200

/** Status code for a path this package does not serve. */
const STATUS_NOT_FOUND = 404

/** Status code for a method the endpoint does not accept. */
const STATUS_METHOD_NOT_ALLOWED = 405

/** Methods a read-only endpoint accepts. */
const ALLOWED_METHODS = 'GET, HEAD'

/** Base URL used only to parse a request target; never dialled. */
const PARSE_BASE = 'http://localhost'

/** Route match kind: `exact` matches the pathname verbatim; `prefix` its subtree. */
type RouteKind = 'exact' | 'prefix'

/** One named route registration, as the host's browser carrier accepts it. */
interface WebRoute {
  /** How the pathname is matched. */
  kind: RouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle, including holding the response open. */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/**
 * Minimal browser-carrier contract used without a host source checkout.
 *
 * The host's real service is richer — upgrade routes, a fallback seat, index
 * taps — but a companion that adds three JSON endpoints must not depend on the
 * whole surface.
 */
interface WebServerLike {
  register: (route: WebRoute) => () => void
}

/**
 * Whether a value is a browser carrier.
 *
 * @param value - Candidate service.
 * @returns True when the value implements the narrow registration contract.
 */
function isWebServerLike(value: unknown): value is WebServerLike {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.register === 'function'
}

/**
 * Whether a value is the Jev service this package provides.
 *
 * @param value - Candidate service.
 * @returns True when the value can answer the exposed reads.
 */
function isJevService(value: unknown): value is JevService {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.model === 'string'
    && typeof value.enabled === 'boolean'
    && typeof value.usage === 'function'
  )
}

/**
 * Resolve the host's browser carrier through Cordis's named service lookup.
 *
 * @param ctx - Cordis context carrying the host service.
 * @returns The host web server.
 * @throws {Error} When the companion is loaded without its host service.
 */
function getWebServer(ctx: Context): WebServerLike {
  const webServer: unknown = ctx.get('webServer')
  if (!isWebServerLike(webServer)) {
    throw new Error('route companion requires the "webServer" service')
  }
  return webServer
}

/**
 * Resolve the Jev service this package provided.
 *
 * @param ctx - Cordis context carrying the package service.
 * @returns The Jev service.
 * @throws {Error} When the companion is mounted without the core plugin row.
 */
function getJevService(ctx: Context): JevService {
  const service: unknown = ctx.get('jev')
  if (!isJevService(service)) {
    throw new Error(
      'route companion requires the "jev" service; mount the dsh-plugin-system-one row first',
    )
  }
  return service
}

/**
 * Write one JSON response.
 *
 * The content length is measured from the encoded bytes rather than the string
 * length, so a payload containing multi-byte characters is not truncated by a
 * length that counted characters.
 *
 * @param res - The response to own.
 * @param status - HTTP status code.
 * @param body - Any JSON-serializable value.
 */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/**
 * Read the pathname of an incoming request target.
 *
 * @param req - The arriving request.
 * @returns The pathname, without query string.
 */
function pathnameOf(req: IncomingMessage): string {
  return new URL(req.url ?? '/', PARSE_BASE).pathname
}

/**
 * Build the body one path serves.
 *
 * @param pathname - Request pathname.
 * @param service - The Jev service.
 * @returns The response body, or `undefined` when the path is not ours.
 */
function bodyFor(pathname: string, service: JevService): unknown {
  if (pathname === HEALTH_PATH) {
    return { ok: true, enabled: service.enabled, model: service.model }
  }
  if (pathname === USAGE_PATH) {
    return service.usage(USAGE_RECENT_LIMIT)
  }
  if (pathname === CATALOG_PATH) {
    return { banks: BANKS }
  }
  return undefined
}

/**
 * Answer one request.
 *
 * @param req - The arriving request.
 * @param res - The response to own.
 * @param service - The Jev service.
 */
function handle(req: IncomingMessage, res: ServerResponse, service: JevService): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', ALLOWED_METHODS)
    writeJson(res, STATUS_METHOD_NOT_ALLOWED, { error: 'method not allowed' })
    return
  }
  const body = bodyFor(pathnameOf(req), service)
  if (body === undefined) {
    writeJson(res, STATUS_NOT_FOUND, { error: 'not found' })
    return
  }
  writeJson(res, STATUS_OK, body)
}

/**
 * Register this package's HTTP routes.
 *
 * @param ctx - Cordis context carrying the `webServer` and `jev` services.
 * @returns The route registration's disposer after setup succeeds.
 */
async function apply(ctx: Context): Promise<() => void> {
  const webServer = getWebServer(ctx)
  const service = getJevService(ctx)
  const disposer = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      handle(req, res, service)
    },
  })
  // Preserve the asynchronous plugin contract after synchronous registration.
  await Promise.resolve(disposer)
  return disposer
}

export {
  CATALOG_PATH,
  HEALTH_PATH,
  ROUTE_PREFIX,
  STATUS_METHOD_NOT_ALLOWED,
  STATUS_NOT_FOUND,
  USAGE_PATH,
  apply,
  bodyFor,
  handle,
  inject,
  name,
}

