# dsh-custom-search-fetch

[English](README.md) | 中文

DeepSeek Harness 插件：让内置 `web_search` 走自托管 [SearXNG](https://docs.searxng.org/)，内置 `web_fetch` 走自托管 [Firecrawl](https://github.com/firecrawl/firecrawl)。

插件不注册新工具，而是使用 `@deepseek-ai/dsh-web` 提供的 `ctx.web` provider 接缝：

- 注册搜索 provider `custom-searxng` 和抓取 provider `custom-firecrawl`；
- bundle patch 把 `@deepseek-ai/dsh-web` 固定到这两个 provider（`searchProvider: custom-searxng`、`fetchProvider: custom-firecrawl`）。

内置 `web_search` / `web_fetch` 的输出格式、引用提示、按 agent preset 的可用性和超时策略都不变，只换后端。

需要 DeepSeek Harness `>=0.2.2-rc.1`。

## 安装

```sh
dsh plugin --profile <profile> add github:mercurynomercy/dsh-custom-search-fetch
```

收录后也可以在插件页 / dsh-market 安装。卸载插件即恢复 DeepSeek 搜索和匿名 HTTP 抓取。

## 配置

在 **插件 → dsh-custom-search-fetch** 页面配置，或写进 profile 的 `cordis.patch.yml`。按 id 定位的行会整体替换 config，设置过的字段都要写全：

```yaml
- id: dsh-custom-search-fetch
  config:
    searxngBaseURL: http://localhost:8080
    firecrawlBaseURL: http://localhost:3002
```

全部字段见 [英文 README](README.md#configure)。常用的几项：

- `searxngBaseURL`：SearXNG 地址，不含 `/search`
- `searxngEngines` / `searxngLanguage` / `searxngCategories`：非空时原样传给 SearXNG
- `searxngSafeSearch`：`0` / `1` / `2`，不设置时用实例自己的 `search.safe_search`
- `firecrawlBaseURL`：Firecrawl API 地址，不含 `/v2`
- `firecrawlApiKey` 或 `firecrawlApiKeyEnv`（默认 `FIRECRAWL_API_KEY`）：无鉴权的自托管实例留空即可
- `firecrawlTimeoutMs`（默认 25000）：要小于 tool-web 的 `fetchTimeoutMs`（默认 30000）

### SearXNG 前提

SearXNG 默认不开 JSON 输出，会返回 403。在 `settings.yml` 中开启：

```yaml
search:
  formats:
    - html
    - json
```

如果开了 limiter，要放行 Harness 所在主机，否则会返回 429。

## 只切回其中一个后端

在 profile 的 `cordis.patch.yml` 里重写 `web` 行。例如保留 SearXNG 搜索、抓取改回内置 HTTP：

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: custom-searxng
    fetchProvider: http
```

在“网页搜索”设置页保存“使用新版 Web Search API”开关，同样会改写这一行，并且优先于本插件。

## 开发

```sh
npm install
npm test
SEARXNG_URL=http://localhost:8080 FIRECRAWL_URL=http://localhost:3002 npm run smoke -- "关键词" https://example.com
```

## 许可

MIT
