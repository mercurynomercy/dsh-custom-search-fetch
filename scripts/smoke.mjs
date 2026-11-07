// Live smoke test: boots the plugin next to the real dsh-web service in a Cordis root and
// runs one search and one fetch against real instances.
//   SEARXNG_URL=http://localhost:8080 FIRECRAWL_URL=http://localhost:3002 npm run smoke
import { Context } from '@deepseek-ai/cordis'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import * as plugin from '../lib/index.js'

const root = new Context()
await root.plugin(WebRuntime, { searchProvider: plugin.SEARCH_PROVIDER_ID, fetchProvider: plugin.FETCH_PROVIDER_ID })
await root.plugin(plugin, {
  searxngBaseURL: process.env.SEARXNG_URL ?? 'http://localhost:8080',
  firecrawlBaseURL: process.env.FIRECRAWL_URL ?? 'http://localhost:3002',
})

const query = process.argv[2] ?? 'DeepSeek Harness plugin'
const url = process.argv[3] ?? 'https://example.com'

const search = await root.web.search({ query, maxResults: 5 })
console.log(`search "${query}": ${search.sources.length} sources, truncated=${search.truncated}`)
for (const source of search.sources) console.log(`  - ${source.title ?? '(untitled)'} <${source.url}>`)

const page = await root.web.fetch({ url })
console.log(`fetch ${url}: HTTP ${page.statusCode} final=${page.url} chars=${page.body.content.length} truncated=${page.truncated}`)
console.log(page.body.content.slice(0, 300))
