# dsh-custom-search-fetch

English | [中文](README.zh.md)

A DeepSeek Harness plugin that runs the built-in `web_search` tool on a self-hosted [SearXNG](https://docs.searxng.org/) instance and the built-in `web_fetch` tool on a self-hosted [Firecrawl](https://github.com/firecrawl/firecrawl) instance.

The plugin does not register its own tools. It uses the `ctx.web` provider seam that `@deepseek-ai/dsh-web` provides:

- it registers a search provider `custom-searxng` and a fetch provider `custom-firecrawl`;
- its bundle patch pins `@deepseek-ai/dsh-web` to them (`searchProvider: custom-searxng`, `fetchProvider: custom-firecrawl`).

The shipped `web_search` / `web_fetch` tools, with their output format, citation instruction, per-agent-preset availability, and timeout policy, are unchanged. Only the backend changes.

Requires DeepSeek Harness `>=0.2.2-rc.1`.

## Install

```sh
dsh plugin --profile <profile> add github:mercurynomercy/dsh-custom-search-fetch
```

You can also install it from the Plugins page / dsh-market once it is listed. Removing the plugin restores DeepSeek search and anonymous HTTP fetch.

## Configure

Configure the plugin from **Plugins → dsh-custom-search-fetch**, or in your profile's `cordis.patch.yml`. An id-targeted row replaces the whole config, so restate every field you set:

```yaml
- id: dsh-custom-search-fetch
  config:
    searxngBaseURL: http://localhost:8080
    firecrawlBaseURL: http://localhost:3002
```

| Field | Default | Meaning |
|---|---|---|
| `searxngBaseURL` | `http://localhost:8080` | SearXNG base URL, without `/search` |
| `searxngMaxResults` | `10` | Results per search (the tool's `searchMaxResults`, 8 by default, caps it further) |
| `searxngMaxPages` | `2` | Most result pages fetched to reach that count |
| `searxngLanguage` / `searxngCategories` / `searxngEngines` | empty | Passed through to SearXNG when set |
| `searxngSafeSearch` | unset | `0`, `1`, or `2`; unset uses the instance's `search.safe_search` |
| `searxngTimeRange` | empty | `day`, `week`, `month`, or `year` |
| `searxngTimeoutMs` | `15000` | Timeout for one page request |
| `firecrawlBaseURL` | `http://localhost:3002` | Firecrawl API base, without `/v2` |
| `firecrawlApiVersion` | `v2` | `v2` or `v1` scrape endpoint |
| `firecrawlApiKey` | empty | Literal key (secret field); leave empty for a self-host without auth |
| `firecrawlApiKeyEnv` | `FIRECRAWL_API_KEY` | Credential or environment variable to read when no literal key is set |
| `firecrawlOnlyMainContent` | `true` | Strip navigation, headers, and footers |
| `firecrawlTimeoutMs` | `25000` | Firecrawl's own scrape timeout |
| `firecrawlMaxAgeMs` | `0` | v2 only: accept a cached copy up to this age; `0` always scrapes fresh |
| `firecrawlMaxBodyChars` | `100000` | Markdown characters returned before truncation |

### SearXNG prerequisites

SearXNG answers `403` unless its JSON output format is on. Enable it in `settings.yml`:

```yaml
search:
  formats:
    - html
    - json
```

If the instance's limiter is on, allow the Harness host or turn the limiter off for it. Otherwise searches fail with `429`.

### Timeouts

`web_fetch` runs under tool-web's `fetchTimeoutMs` budget, which is 30 s by default. Keep `firecrawlTimeoutMs` below it. If you raise it for slow, JavaScript-heavy pages, raise `fetchTimeoutMs` on the `tool-web` row as well.

## Behaviour

- **Search**: `GET /search?format=json`. The plugin pages until it has enough unique URLs or reaches `searxngMaxPages`. SearXNG answers and infobox text become the result's `content`, which `web_search` shows above the sources. If no results come back and some engines failed, the error names those engines. If nothing was found but SearXNG has spelling suggestions, they are returned as the content.
- **Fetch**: `POST /v2/scrape` (or `/v1/scrape`) with `formats: ["markdown"]`. The page Markdown is returned as a `text` body, with the page title as a heading. The status code and final URL come from Firecrawl's metadata. The plugin checks URLs the same way the shipped HTTP fetcher does before sending anything: http(s) only, at most 2048 characters, no embedded credentials. Firecrawl also converts PDFs and other documents to Markdown.
- **Errors** are `WebError`s: `WEB_PROVIDER_ERROR` names the endpoint and how to fix it, `WEB_ABORTED` is a cancellation, and `WEB_INVALID_URL` / `WEB_BLOCKED_URL` are rejected URLs. If you clear a base URL, the pinned provider becomes unavailable and calls fail with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.

## Switching one backend back

Restate the `web` row in your profile `cordis.patch.yml`. For example, to keep SearXNG search and fetch with the built-in anonymous HTTP fetcher:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: custom-searxng
    fetchProvider: http
```

The built-in ids are `deepseek-official` (search), `http` (fetch), and `deepseek-search-api` / `deepseek-fetch-api`. Saving the **Web search** settings page's "Use the new Web Search API" switch also rewrites this row in your profile patch, and that row wins over this plugin.

## Conflicts

Provider ids are unique within each kind. Another plugin that registers `custom-searxng` or `custom-firecrawl` makes the second registration fail with `WEB_DUPLICATE_PROVIDER`. Do not also insert the `dsh-custom-search-fetch` row by hand, because the bundle patch already inserts it.

## Develop

```sh
npm install
npm test                                                      # unit tests, mocked fetch, real dsh-web + Cordis
SEARXNG_URL=http://localhost:8080 FIRECRAWL_URL=http://localhost:3002 npm run smoke -- "query" https://example.com
```

To try a checkout in a profile: `dsh plugin --profile <profile> add link:$(pwd)`.

## License

MIT
