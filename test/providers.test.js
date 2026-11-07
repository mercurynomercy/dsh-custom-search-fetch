import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import * as plugin from '../lib/index.js'
import {
  Config,
  createApiKeyResolver,
  FETCH_PROVIDER_ID,
  FirecrawlFetchProvider,
  mapFirecrawlResponse,
  SEARCH_PROVIDER_ID,
  SearxngSearchProvider,
  snapshot,
  validateFetchUrl,
} from '../lib/index.js'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Replace global fetch with a handler and record every call. */
function mockFetch(handler) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    return handler(String(input), init, calls.length)
  }
  return calls
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const options = (overrides = {}) => () => snapshot(Config({ searxngBaseURL: 'http://searx.test', firecrawlBaseURL: 'http://fc.test', ...overrides }))

describe('SearxngSearchProvider', () => {
  it('maps results, answers, and caps to maxResults', async () => {
    const calls = mockFetch(() => json({
      results: [
        { url: 'https://a.test', title: 'A', content: 'alpha', publishedDate: '2026-01-01' },
        { url: 'https://a.test', title: 'dup' },
        { url: 'https://b.test', title: 'B' },
        { url: 'https://c.test', title: 'C' },
      ],
      answers: [{ answer: '42' }],
    }))
    const result = await new SearxngSearchProvider(options({ searxngEngines: 'google,bing', searxngLanguage: 'en' }))
      .search({ query: 'life', maxResults: 2 })
    assert.equal(calls.length, 1)
    const url = new URL(calls[0].url)
    assert.equal(url.pathname, '/search')
    assert.equal(url.searchParams.get('format'), 'json')
    assert.equal(url.searchParams.get('q'), 'life')
    assert.equal(url.searchParams.get('engines'), 'google,bing')
    assert.equal(url.searchParams.get('language'), 'en')
    assert.equal(url.searchParams.has('categories'), false)
    assert.equal(url.searchParams.has('safesearch'), false)
    assert.equal(result.content, '42')
    assert.deepEqual(result.sources, [
      { url: 'https://a.test', title: 'A', snippet: 'alpha', publishedAt: '2026-01-01' },
      { url: 'https://b.test', title: 'B' },
    ])
    assert.equal(result.truncated, true)
  })

  it('pages until enough results, bounded by searxngMaxPages', async () => {
    const calls = mockFetch((url) => {
      const page = Number(new URL(url).searchParams.get('pageno'))
      return json({ results: [{ url: `https://p${page}.test` }] })
    })
    const result = await new SearxngSearchProvider(options({ searxngMaxPages: 3 })).search({ query: 'x', maxResults: 10 })
    assert.equal(calls.length, 3)
    assert.equal(result.sources.length, 3)
  })

  it('reports failed engines when nothing came back', async () => {
    mockFetch(() => json({ results: [], unresponsive_engines: [['google', 'timeout']] }))
    await assert.rejects(new SearxngSearchProvider(options()).search({ query: 'x' }), (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /google \(timeout\)/)
      return true
    })
  })

  it('returns suggestions as content on an empty result', async () => {
    mockFetch(() => json({ results: [], suggestions: ['deepseek harness'] }))
    const result = await new SearxngSearchProvider(options()).search({ query: 'deepsek harnes' })
    assert.deepEqual(result.sources, [])
    assert.match(result.content, /deepseek harness/)
  })

  it('explains a 403 as the disabled JSON format', async () => {
    mockFetch(() => new Response('Forbidden', { status: 403 }))
    await assert.rejects(new SearxngSearchProvider(options()).search({ query: 'x' }), /search\.formats/)
  })

  it('maps an unreachable instance to WEB_PROVIDER_ERROR naming the endpoint', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })
    })
    await assert.rejects(new SearxngSearchProvider(options()).search({ query: 'x' }), (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /http:\/\/searx\.test\/search/)
      assert.match(error.message, /ECONNREFUSED/)
      return true
    })
  })

  it('is unavailable without a valid http(s) base URL', () => {
    assert.equal(new SearxngSearchProvider(options({ searxngBaseURL: '' })).available(), false)
    assert.equal(new SearxngSearchProvider(options({ searxngBaseURL: 'ftp://x' })).available(), false)
    assert.equal(new SearxngSearchProvider(options()).available(), true)
  })

  it('honours an already-aborted signal without a request', async () => {
    const calls = mockFetch(() => json({ results: [] }))
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(new SearxngSearchProvider(options()).search({ query: 'x' }, controller.signal), { code: 'WEB_ABORTED' })
    assert.equal(calls.length, 0)
  })
})

describe('FirecrawlFetchProvider', () => {
  const noKey = async () => undefined

  it('posts a v2 scrape and maps markdown, status, and final URL', async () => {
    const calls = mockFetch(() => json({
      success: true,
      data: { markdown: 'Body text', metadata: { title: 'Page', statusCode: 404, url: 'https://x.test/final' } },
    }))
    const result = await new FirecrawlFetchProvider(options(), noKey).fetch({ url: 'https://x.test/start' })
    assert.equal(calls[0].url, 'http://fc.test/v2/scrape')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.headers.authorization, undefined)
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      url: 'https://x.test/start',
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 25000,
      maxAge: 0,
    })
    assert.deepEqual(result, {
      url: 'https://x.test/final',
      statusCode: 404,
      body: { kind: 'text', content: '# Page\n\nBody text' },
      truncated: false,
    })
  })

  it('uses v1 without maxAge and sends the API key', async () => {
    const calls = mockFetch(() => json({ success: true, data: { markdown: '# T\nx' } }))
    await new FirecrawlFetchProvider(options({ firecrawlApiVersion: 'v1' }), async () => 'fc-key').fetch({ url: 'https://x.test' })
    assert.equal(calls[0].url, 'http://fc.test/v1/scrape')
    assert.equal(calls[0].init.headers.authorization, 'Bearer fc-key')
    assert.equal('maxAge' in JSON.parse(calls[0].init.body), false)
  })

  it('truncates long markdown', () => {
    const result = mapFirecrawlResponse({ success: true, data: { markdown: 'x'.repeat(50) } }, 'https://x.test', 10)
    assert.equal(result.body.content.length, 10)
    assert.equal(result.truncated, true)
  })

  it('surfaces Firecrawl errors and auth hints', async () => {
    mockFetch(() => json({ success: false, error: 'Unauthorized' }, 401))
    await assert.rejects(new FirecrawlFetchProvider(options(), noKey).fetch({ url: 'https://x.test' }), (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /HTTP 401: Unauthorized/)
      assert.match(error.message, /firecrawlApiKey/)
      return true
    })
    mockFetch(() => json({ success: false, error: 'All scraping engines failed' }))
    await assert.rejects(new FirecrawlFetchProvider(options(), noKey).fetch({ url: 'https://x.test' }), /All scraping engines failed/)
  })

  it('rejects non-http URLs and embedded credentials before any request', async () => {
    const calls = mockFetch(() => json({}))
    assert.throws(() => validateFetchUrl('file:///etc/passwd'), { code: 'WEB_INVALID_URL' })
    assert.throws(() => validateFetchUrl('https://u:p@x.test'), { code: 'WEB_BLOCKED_URL' })
    await assert.rejects(new FirecrawlFetchProvider(options(), noKey).fetch({ url: 'javascript:alert(1)' }), { code: 'WEB_INVALID_URL' })
    assert.equal(calls.length, 0)
  })
})

describe('apply', () => {
  /** A real Cordis root with the real WebRuntime, pinned the way the bundle patch pins it. */
  async function harness(pluginConfig) {
    const root = new Context()
    await root.plugin(WebRuntime, { searchProvider: SEARCH_PROVIDER_ID, fetchProvider: FETCH_PROVIDER_ID })
    await root.plugin(plugin, pluginConfig)
    return root.web
  }

  it('routes ctx.web search and fetch through the pinned providers', async () => {
    process.env.TEST_FC_KEY = 'from-env'
    const web = await harness({ searxngBaseURL: 'http://searx.test', firecrawlBaseURL: 'http://fc.test', firecrawlApiKeyEnv: 'TEST_FC_KEY' })
    const calls = mockFetch((url) => url.startsWith('http://searx.test')
      ? json({ results: [{ url: 'https://a.test', title: 'A' }] })
      : json({ success: true, data: { markdown: 'hello' } }))
    const search = await web.search({ query: 'q', maxResults: 5 })
    assert.equal(search.sources[0].url, 'https://a.test')
    const page = await web.fetch({ url: 'https://a.test' })
    assert.equal(page.body.content, 'hello')
    const scrape = calls.find((call) => call.url === 'http://fc.test/v2/scrape')
    assert.equal(scrape.init.headers.authorization, 'Bearer from-env')
  })

  it('resolves the key from the credentials service first', async () => {
    const credentials = { resolve: async (ref) => (ref === 'MY_FC_KEY' ? { value: 'from-store' } : undefined) }
    const resolve = createApiKeyResolver({ get: (name) => (name === 'credentials' ? credentials : undefined) })
    assert.equal(await resolve({ firecrawlApiKeyEnv: 'MY_FC_KEY' }), 'from-store')
    assert.equal(await resolve({ firecrawlApiKey: 'literal', firecrawlApiKeyEnv: 'MY_FC_KEY' }), 'literal')
    assert.equal(await resolve({ firecrawlApiKeyEnv: 'UNSET_FC_KEY_XYZ' }), undefined)
  })

  it('fails as configured-unavailable when a base URL is cleared', async () => {
    const web = await harness({ searxngBaseURL: '' })
    await assert.rejects(web.search({ query: 'q' }), { code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })
  })
})
