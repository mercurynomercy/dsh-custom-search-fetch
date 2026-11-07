/**
 * dsh-custom-search-fetch — self-hosted SearXNG search and Firecrawl fetch for the
 * DeepSeek Harness web capability seam (`ctx.web`).
 *
 * The plugin does not replace the shipped `web_search` / `web_fetch` tools. It
 * registers two providers into `ctx.web`, and the bundle patch pins
 * `@deepseek-ai/dsh-web`'s `searchProvider` / `fetchProvider` to them, so the
 * shipped tools (with their rendering, citation, and timeout policy) run on the
 * self-hosted backends instead of DeepSeek search and anonymous HTTP fetch.
 *
 * @module dsh-custom-search-fetch
 */

import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'

/** Search provider id the bundle patch pins in `web.searchProvider`. */
export const SEARCH_PROVIDER_ID = 'custom-searxng'
/** Fetch provider id the bundle patch pins in `web.fetchProvider`. */
export const FETCH_PROVIDER_ID = 'custom-firecrawl'

const USER_AGENT = 'dsh-custom-search-fetch (+https://github.com/mercurynomercy/dsh-custom-search-fetch)'
const MAX_URL_LENGTH = 2048
const SEARXNG_TIME_RANGES = ['', 'day', 'week', 'month', 'year']
/** Extra time over Firecrawl's own `timeout` before the local request gives up. */
const FIRECRAWL_TIMEOUT_GRACE_MS = 5000

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-custom-search-fetch'
/** The web seam both providers register into. */
export const inject = ['web']

export const Config = z.object({
  searxngBaseURL: z.string().default('http://localhost:8080').volatile()
    .description('SearXNG instance base URL, without /search. The JSON format must be enabled in its settings.yml (search.formats: [html, json]).'),
  searxngMaxResults: z.number().step(1).min(1).max(50).default(10).volatile()
    .description('Results requested per search when the caller does not ask for fewer.'),
  searxngMaxPages: z.number().step(1).min(1).max(5).default(2).volatile()
    .description('Upper bound on SearXNG result pages fetched to reach the result count.'),
  searxngLanguage: z.string().default('').volatile()
    .description('SearXNG language code, e.g. en, zh-CN, or empty for the instance default.'),
  searxngCategories: z.string().default('').volatile()
    .description('Comma-separated SearXNG categories, e.g. general,news. Empty uses the instance default.'),
  searxngEngines: z.string().default('').volatile()
    .description('Comma-separated SearXNG engines, e.g. google,bing,duckduckgo. Empty uses the instance default.'),
  searxngSafeSearch: z.union([0, 1, 2]).volatile()
    .description('Safe search level: 0 off, 1 moderate, 2 strict. Unset uses the instance default (search.safe_search).'),
  searxngTimeRange: z.union(SEARXNG_TIME_RANGES).default('').volatile()
    .description('Restrict results to a time range, or empty for no restriction.'),
  searxngTimeoutMs: z.number().step(1).min(1000).default(15000).volatile()
    .description('Timeout for one SearXNG page request, in milliseconds.'),

  firecrawlBaseURL: z.string().default('http://localhost:3002').volatile()
    .description('Firecrawl API base URL, without the /v2 path.'),
  firecrawlApiVersion: z.union(['v2', 'v1']).default('v2').volatile()
    .description('Firecrawl scrape API version.'),
  firecrawlApiKey: z.string().role('secret').volatile()
    .description('Firecrawl API key. Leave empty for a self-hosted instance without authentication, or use the credential reference below.'),
  firecrawlApiKeyEnv: z.string().role('credential-ref').default('FIRECRAWL_API_KEY').volatile()
    .description('Credential or environment variable holding the Firecrawl API key; used when no literal key is set.'),
  firecrawlOnlyMainContent: z.boolean().default(true).volatile()
    .description('Strip navigation, headers, and footers from the page.'),
  firecrawlTimeoutMs: z.number().step(1).min(1000).default(25000).volatile()
    .description('Firecrawl scrape timeout in milliseconds. Keep it below web_fetch\'s tool budget (tool-web fetchTimeoutMs, 30000 by default).'),
  firecrawlMaxAgeMs: z.number().step(1).min(0).default(0).volatile()
    .description('v2 only: accept a Firecrawl cached copy up to this age in milliseconds; 0 always scrapes fresh.'),
  firecrawlMaxBodyChars: z.number().step(1).min(1000).default(100000).volatile()
    .description('Characters of Markdown returned to the model before truncation.'),
})

/** Read a config field whether the loader hands it as a volatile accessor or a plain value. */
function read(config, key) {
  const value = config[key]
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

/** Snapshot the whole config once per operation, so one call never mixes two settings sections. */
export function snapshot(config) {
  const out = {}
  for (const key of Object.keys(Config.dict)) out[key] = read(config, key)
  return out
}

// ── shared helpers ──────────────────────────────────────────────────────────

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function trimBase(baseURL) {
  return String(baseURL ?? '').trim().replace(/\/+$/u, '')
}

function isHttpBase(baseURL) {
  if (!URL.canParse(baseURL)) return false
  const { protocol } = new URL(baseURL)
  return protocol === 'http:' || protocol === 'https:'
}

function isAbortError(error) {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** Combine the caller's signal with a local deadline. */
function withDeadline(signal, timeoutMs) {
  const deadline = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? deadline : AbortSignal.any([signal, deadline])
}

/** Map a transport failure: caller cancellation, local timeout, or an unreachable endpoint. */
function transportError(label, endpoint, error, signal, settingsHint) {
  if (signal?.aborted === true) return new WebError(`${label} request aborted`, 'WEB_ABORTED', { cause: signal.reason })
  if (isAbortError(error)) {
    return new WebError(`${label} request to ${endpoint} timed out`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
  return new WebError(
    `${label} request to ${endpoint} failed: ${String(error?.cause?.message ?? error?.message ?? error)}\n\n${settingsHint}`,
    'WEB_PROVIDER_ERROR',
    { cause: error },
  )
}

async function readErrorDetail(response) {
  try {
    const body = await response.text()
    try {
      const parsed = JSON.parse(body)
      const detail = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? parsed?.message ?? parsed?.detail
      if (typeof detail === 'string' && detail.length > 0) return detail.slice(0, 500)
    } catch {}
    return text(body)?.slice(0, 200)
  } catch {
    return undefined
  }
}

// ── SearXNG search ──────────────────────────────────────────────────────────

const SEARXNG_HINT = 'Check that SearXNG is running and that dsh-custom-search-fetch.searxngBaseURL points at it (Plugins > dsh-custom-search-fetch, or your profile cordis.patch.yml). Only the user should change this setting.'

/** Normalize SearXNG's `unresponsive_engines` (`[[engine, reason]]`, or bare strings on old builds). */
export function readUnresponsiveEngines(body) {
  const raw = Array.isArray(body?.unresponsive_engines) ? body.unresponsive_engines : []
  const labels = []
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const label = text(entry)
      if (label !== undefined) labels.push(label)
    } else if (Array.isArray(entry)) {
      const engine = text(entry[0])
      if (engine === undefined) continue
      const reason = text(entry[1])
      labels.push(reason === undefined ? engine : `${engine} (${reason})`)
    }
  }
  return labels
}

/** Direct answers and infobox text SearXNG resolved, rendered by web_search ahead of the sources. */
export function readAnswerContent(body) {
  const parts = []
  const seen = new Set()
  const push = (value) => {
    const t = text(value)
    if (t !== undefined && !seen.has(t)) {
      seen.add(t)
      parts.push(t)
    }
  }
  for (const entry of Array.isArray(body?.answers) ? body.answers : []) push(typeof entry === 'string' ? entry : entry?.answer)
  for (const box of Array.isArray(body?.infoboxes) ? body.infoboxes : []) {
    const title = text(box?.infobox)
    const content = text(box?.content)
    if (content !== undefined) push(title === undefined ? content : `${title}: ${content}`)
  }
  return parts.length === 0 ? undefined : parts.join('\n\n')
}

/** Spelling corrections and suggestions; only worth surfacing when nothing was found. */
export function readSuggestions(body) {
  const out = []
  for (const key of ['corrections', 'suggestions']) {
    for (const entry of Array.isArray(body?.[key]) ? body[key] : []) {
      const value = typeof entry === 'string' ? text(entry) : text(entry?.title ?? entry?.url)
      if (value !== undefined && !out.includes(value)) out.push(value)
    }
  }
  return out
}

/** Map one SearXNG JSON page to seam sources, skipping URLs already in `seen`. */
export function mapSearxngResults(body, seen = new Set()) {
  const sources = []
  for (const item of Array.isArray(body?.results) ? body.results : []) {
    if (!isRecord(item)) continue
    const url = text(item.url)
    if (url === undefined || seen.has(url)) continue
    seen.add(url)
    const title = text(item.title)
    const snippet = text(item.content)
    const publishedAt = text(item.publishedDate)
    sources.push({
      url,
      ...(title === undefined ? {} : { title }),
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    })
  }
  return sources
}

export function buildSearxngUrl(options, query, pageno) {
  const url = new URL(`${trimBase(options.searxngBaseURL)}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('pageno', String(pageno))
  if (Number.isInteger(options.searxngSafeSearch)) url.searchParams.set('safesearch', String(options.searxngSafeSearch))
  const optional = {
    language: text(options.searxngLanguage),
    categories: text(options.searxngCategories),
    engines: text(options.searxngEngines),
    time_range: text(options.searxngTimeRange),
  }
  for (const [key, value] of Object.entries(optional)) if (value !== undefined) url.searchParams.set(key, value)
  return url
}

export class SearxngSearchProvider {
  id = SEARCH_PROVIDER_ID
  title = 'SearXNG (self-hosted)'

  /** @param resolveOptions - returns the settings snapshot for the next search. */
  constructor(resolveOptions) {
    this.resolveOptions = resolveOptions
  }

  available() {
    return isHttpBase(trimBase(this.resolveOptions().searxngBaseURL))
  }

  async search(request, signal) {
    const options = this.resolveOptions()
    const query = text(request.query)
    if (query === undefined) throw new WebError('search query must be a non-empty string', 'WEB_INVALID_REQUEST')
    if (signal?.aborted) throw new WebError('SearXNG request aborted', 'WEB_ABORTED', { cause: signal.reason })

    const wanted = Math.max(1, Math.min(options.searxngMaxResults, request.maxResults ?? options.searxngMaxResults))
    const maxPages = Math.max(1, options.searxngMaxPages)
    const seen = new Set()
    const sources = []
    const failedEngines = new Set()
    let content
    let suggestions = []
    let morePages = false

    for (let pageno = 1; pageno <= maxPages; pageno++) {
      const body = await this.fetchPage(options, query, pageno, signal)
      if (pageno === 1) {
        content = readAnswerContent(body)
        suggestions = readSuggestions(body)
      }
      for (const engine of readUnresponsiveEngines(body)) failedEngines.add(engine)
      const page = mapSearxngResults(body, seen)
      sources.push(...page)
      if (sources.length >= wanted || page.length === 0) {
        morePages = page.length > 0
        break
      }
    }

    if (sources.length === 0 && content === undefined) {
      if (failedEngines.size > 0) {
        throw new WebError(
          `SearXNG returned no results because its engines failed: ${[...failedEngines].join(', ')}. Retry later or configure other engines.`,
          'WEB_PROVIDER_ERROR',
        )
      }
      if (suggestions.length > 0) content = `No results. SearXNG suggests: ${suggestions.slice(0, 5).join('; ')}`
    }

    return {
      ...(content === undefined ? {} : { content }),
      sources: sources.slice(0, wanted),
      truncated: sources.length > wanted || (morePages && sources.length >= wanted),
    }
  }

  async fetchPage(options, query, pageno, signal) {
    const url = buildSearxngUrl(options, query, pageno)
    const endpoint = `${url.origin}${url.pathname}`
    let response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        redirect: 'follow',
        signal: withDeadline(signal, options.searxngTimeoutMs),
      })
    } catch (error) {
      throw transportError('SearXNG', endpoint, error, signal, SEARXNG_HINT)
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response)
      const formatHint = response.status === 403
        ? ' SearXNG answers 403 when the JSON output format is disabled: add `json` to `search.formats` in its settings.yml.'
        : response.status === 429
          ? ' SearXNG rate-limited the request: disable its limiter for this client or retry later.'
          : ''
      throw new WebError(
        `SearXNG ${endpoint} answered HTTP ${response.status}${detail === undefined ? '' : `: ${detail}`}.${formatHint}`,
        'WEB_PROVIDER_ERROR',
      )
    }
    try {
      const body = await response.json()
      if (!isRecord(body)) throw new Error('not a JSON object')
      return body
    } catch (error) {
      if (signal?.aborted) throw new WebError('SearXNG request aborted', 'WEB_ABORTED', { cause: signal.reason })
      throw new WebError(`SearXNG ${endpoint} returned an invalid JSON body`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

// ── Firecrawl fetch ─────────────────────────────────────────────────────────

const FIRECRAWL_HINT = 'Check that Firecrawl is running and that dsh-custom-search-fetch.firecrawlBaseURL points at it (Plugins > dsh-custom-search-fetch, or your profile cordis.patch.yml). Only the user should change this setting.'

/** Same pre-network URL policy as the shipped HTTP fetcher: http(s) only, bounded, no embedded credentials. */
export function validateFetchUrl(input) {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH) {
    throw new WebError(`URL must be a string of at most ${MAX_URL_LENGTH} characters`, 'WEB_INVALID_URL')
  }
  let url
  try {
    url = new URL(input)
  } catch (error) {
    throw new WebError(`invalid URL: ${input}`, 'WEB_INVALID_URL', { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError(`unsupported URL scheme "${url.protocol}" (only http and https are allowed)`, 'WEB_INVALID_URL')
  }
  if (url.username.length > 0 || url.password.length > 0) throw new WebError('credentials in URLs are not allowed', 'WEB_BLOCKED_URL')
  return url
}

export function buildFirecrawlBody(options, url) {
  const body = {
    url,
    formats: ['markdown'],
    onlyMainContent: options.firecrawlOnlyMainContent !== false,
    timeout: options.firecrawlTimeoutMs,
  }
  if (options.firecrawlApiVersion !== 'v1') body.maxAge = options.firecrawlMaxAgeMs ?? 0
  return body
}

/** Map a Firecrawl scrape response (v1 and v2 share this shape) to a seam fetch result. */
export function mapFirecrawlResponse(payload, requestedUrl, maxBodyChars) {
  if (!isRecord(payload)) throw new WebError('Firecrawl returned an invalid response body', 'WEB_PROVIDER_ERROR')
  if (payload.success === false) {
    const detail = text(payload.error) ?? 'unknown error'
    throw new WebError(`Firecrawl could not scrape ${requestedUrl}: ${detail}`, 'WEB_PROVIDER_ERROR')
  }
  const data = isRecord(payload.data) ? payload.data : undefined
  if (data === undefined || typeof data.markdown !== 'string') {
    throw new WebError('Firecrawl returned no markdown for the page', 'WEB_PROVIDER_ERROR')
  }
  const metadata = isRecord(data.metadata) ? data.metadata : {}
  const statusCode = Number.isInteger(metadata.statusCode) ? metadata.statusCode : 200
  const finalUrl = text(metadata.url) ?? text(metadata.sourceURL) ?? requestedUrl
  const title = text(metadata.title)
  const markdown = data.markdown
  const titled = title !== undefined && !markdown.trimStart().startsWith('#') ? `# ${title}\n\n${markdown}` : markdown
  const truncated = titled.length > maxBodyChars
  return {
    url: finalUrl,
    statusCode,
    body: { kind: 'text', content: truncated ? titled.slice(0, maxBodyChars) : titled },
    truncated,
  }
}

export class FirecrawlFetchProvider {
  id = FETCH_PROVIDER_ID
  title = 'Firecrawl (self-hosted)'

  /**
   * @param resolveOptions - returns the settings snapshot for the next fetch.
   * @param resolveApiKey - resolves the API key for one fetch, or undefined for none.
   */
  constructor(resolveOptions, resolveApiKey) {
    this.resolveOptions = resolveOptions
    this.resolveApiKey = resolveApiKey
  }

  available() {
    return isHttpBase(trimBase(this.resolveOptions().firecrawlBaseURL))
  }

  async fetch(request, signal) {
    const options = this.resolveOptions()
    const target = validateFetchUrl(request.url).href
    if (signal?.aborted) throw new WebError('Firecrawl request aborted', 'WEB_ABORTED', { cause: signal.reason })

    const version = options.firecrawlApiVersion === 'v1' ? 'v1' : 'v2'
    const endpoint = `${trimBase(options.firecrawlBaseURL)}/${version}/scrape`
    const apiKey = await this.resolveApiKey(options)
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify(buildFirecrawlBody(options, target)),
        redirect: 'error',
        signal: withDeadline(signal, options.firecrawlTimeoutMs + FIRECRAWL_TIMEOUT_GRACE_MS),
      })
    } catch (error) {
      throw transportError('Firecrawl', endpoint, error, signal, FIRECRAWL_HINT)
    }

    let payload
    try {
      payload = await response.json()
    } catch (error) {
      if (signal?.aborted) throw new WebError('Firecrawl request aborted', 'WEB_ABORTED', { cause: signal.reason })
      throw new WebError(`Firecrawl ${endpoint} answered HTTP ${response.status} with an invalid JSON body`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) {
      const detail = text(payload?.error) ?? text(payload?.message)
      const authHint = response.status === 401 || response.status === 403
        ? ' Set firecrawlApiKey, or store the key under the firecrawlApiKeyEnv credential.'
        : ''
      throw new WebError(
        `Firecrawl ${endpoint} answered HTTP ${response.status}${detail === undefined ? '' : `: ${detail}`}.${authHint}`,
        'WEB_PROVIDER_ERROR',
      )
    }
    return mapFirecrawlResponse(payload, target, options.firecrawlMaxBodyChars)
  }
}

// ── plugin entry ────────────────────────────────────────────────────────────

/**
 * Resolve the Firecrawl key per fetch without retaining it: a literal key first, then the
 * credentials service under `firecrawlApiKeyEnv`, then the launching environment.
 */
export function createApiKeyResolver(ctx) {
  return async (options) => {
    const literal = text(options.firecrawlApiKey)
    if (literal !== undefined) return literal
    const ref = text(options.firecrawlApiKeyEnv)
    if (ref === undefined) return undefined
    const credentials = ctx.get?.('credentials')
    if (credentials !== undefined) {
      try {
        const resolved = text((await credentials.resolve(ref))?.value)
        if (resolved !== undefined) return resolved
      } catch {}
    }
    return text(process.env[ref])
  }
}

/** Register the SearXNG search provider and the Firecrawl fetch provider with `ctx.web`. */
export function apply(ctx, config) {
  const options = () => snapshot(config)
  const search = new SearxngSearchProvider(options)
  const fetchProvider = new FirecrawlFetchProvider(options, createApiKeyResolver(ctx))
  ctx.web.registerSearchProvider({
    id: search.id,
    title: search.title,
    available: () => search.available(),
    search: (request, signal) => search.search(request, signal),
  })
  ctx.web.registerFetchProvider({
    id: fetchProvider.id,
    title: fetchProvider.title,
    available: () => fetchProvider.available(),
    fetch: (request, signal) => fetchProvider.fetch(request, signal),
  })
}
