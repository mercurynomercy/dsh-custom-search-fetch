/* dsh-custom-search-fetch browser half — hand-written in the client module system's lazy-CJS
 * factory format (window.__ModuleLoader__.load), so the package installs from source without a
 * build step. It registers a settings card into the Plugins page's `plugins.bundle.config` slot
 * for this package; the card edits the `dsh-custom-search-fetch` row through ctx.configForms,
 * which validates against the Host Config and applies the edit live (all fields are volatile). */
window.__ModuleLoader__.load({
  id: 'dsh-custom-search-fetch',
  factory: (require) => {
    var module = { exports: {} }
    'use strict'

    var React = require('react')
    var ui = require('@deepseek-ai/dsh-client-ui-primitives')
    var h = React.createElement

    var PACKAGE = 'dsh-custom-search-fetch'
    var ENTRY_ID = 'dsh-custom-search-fetch'
    var NS = 'dshCustomSearchFetch'

    var DICTS = {
      en: {
        'section.searxng': 'SearXNG search',
        'section.searxng.hint': 'Backs the built-in web_search tool. The instance must have the JSON format enabled (search.formats: [html, json]).',
        'section.firecrawl': 'Firecrawl fetch',
        'section.firecrawl.hint': 'Backs the built-in web_fetch tool. Pages come back as Markdown.',
        'searxngBaseURL': 'SearXNG URL',
        'searxngBaseURL.hint': 'Base URL without /search, e.g. http://localhost:8080',
        'searxngEngines': 'Engines',
        'searxngEngines.hint': 'Comma-separated, e.g. google,duckduckgo,wikipedia. Empty uses the instance default.',
        'searxngLanguage': 'Language',
        'searxngLanguage.hint': 'e.g. en, zh-CN. Empty uses the instance default.',
        'searxngCategories': 'Categories',
        'searxngCategories.hint': 'Comma-separated, e.g. general,news. Empty uses the instance default.',
        'searxngSafeSearch': 'Safe search',
        'searxngSafeSearch.hint': '0 off, 1 moderate, 2 strict. Empty uses the instance default.',
        'searxngSafeSearch.invalid': 'Enter 0, 1, 2, or leave empty',
        'searxngTimeRange': 'Time range',
        'searxngTimeRange.hint': 'day, week, month, year, or empty for no limit.',
        'searxngTimeRange.invalid': 'Enter day, week, month, year, or leave empty',
        'searxngMaxResults': 'Results per search',
        'searxngMaxResults.hint': '1 to 50. web_search caps it further with its own searchMaxResults (8 by default).',
        'searxngMaxPages': 'Max result pages',
        'searxngMaxPages.hint': '1 to 5 SearXNG pages fetched to reach the result count.',
        'searxngTimeoutMs': 'Search timeout (ms)',
        'searxngTimeoutMs.hint': 'Timeout for one SearXNG page request.',
        'firecrawlBaseURL': 'Firecrawl URL',
        'firecrawlBaseURL.hint': 'API base without /v2, e.g. http://localhost:3002',
        'firecrawlApiVersion': 'API version',
        'firecrawlApiVersion.hint': 'v2 or v1.',
        'firecrawlApiVersion.invalid': 'Enter v2 or v1',
        'firecrawlApiKey': 'API key',
        'firecrawlApiKey.hint': 'Leave blank for a self-hosted instance without authentication. A blank field keeps the stored key.',
        'firecrawlApiKey.set': 'Configured',
        'firecrawlApiKey.unset': 'Not set',
        'firecrawlApiKeyEnv': 'API key credential',
        'firecrawlApiKeyEnv.hint': 'Credential or environment variable read when no key is set above.',
        'firecrawlOnlyMainContent': 'Main content only',
        'firecrawlOnlyMainContent.on': 'Navigation, headers, and footers are stripped.',
        'firecrawlOnlyMainContent.off': 'The whole page is returned.',
        'firecrawlTimeoutMs': 'Scrape timeout (ms)',
        'firecrawlTimeoutMs.hint': 'Keep it below web_fetch\'s tool budget (30000 by default).',
        'firecrawlMaxAgeMs': 'Cache max age (ms)',
        'firecrawlMaxAgeMs.hint': 'v2 only. Accept a cached copy up to this age; 0 always scrapes fresh.',
        'firecrawlMaxBodyChars': 'Max characters',
        'firecrawlMaxBodyChars.hint': 'Markdown characters returned to the model before truncation.',
        'invalid': 'This value is not valid',
        'invalid.number': 'Enter a whole number, or leave empty for the default',
        'overridden': 'Overridden',
        'reset': 'Reset to default',
        'save': 'Save',
        'saving': 'Saving…',
        'saveFailed': 'The settings were not accepted; your edits are kept so you can fix them.',
        'readonly': 'This deployment stores settings read-only.',
        'unavailable': 'This plugin is not running, so it cannot be configured right now.'
      },
      zh: {
        'section.searxng': 'SearXNG 搜索',
        'section.searxng.hint': '内置 web_search 工具的后端。实例需开启 JSON 输出（search.formats: [html, json]）。',
        'section.firecrawl': 'Firecrawl 抓取',
        'section.firecrawl.hint': '内置 web_fetch 工具的后端，网页以 Markdown 返回。',
        'searxngBaseURL': 'SearXNG 地址',
        'searxngBaseURL.hint': '不含 /search，例如 http://localhost:8080',
        'searxngEngines': '搜索引擎',
        'searxngEngines.hint': '逗号分隔，例如 google,duckduckgo,wikipedia。留空用实例默认。',
        'searxngLanguage': '语言',
        'searxngLanguage.hint': '例如 en、zh-CN。留空用实例默认。',
        'searxngCategories': '分类',
        'searxngCategories.hint': '逗号分隔，例如 general,news。留空用实例默认。',
        'searxngSafeSearch': '安全搜索',
        'searxngSafeSearch.hint': '0 关闭，1 中等，2 严格。留空用实例默认。',
        'searxngSafeSearch.invalid': '请填 0、1、2，或留空',
        'searxngTimeRange': '时间范围',
        'searxngTimeRange.hint': 'day、week、month、year，留空不限。',
        'searxngTimeRange.invalid': '请填 day、week、month、year，或留空',
        'searxngMaxResults': '每次搜索结果数',
        'searxngMaxResults.hint': '1 到 50。web_search 自身的 searchMaxResults（默认 8）会再截断。',
        'searxngMaxPages': '最多翻页数',
        'searxngMaxPages.hint': '为凑够结果数最多请求 1 到 5 页。',
        'searxngTimeoutMs': '搜索超时（毫秒）',
        'searxngTimeoutMs.hint': '单页 SearXNG 请求的超时时间。',
        'firecrawlBaseURL': 'Firecrawl 地址',
        'firecrawlBaseURL.hint': 'API 地址，不含 /v2，例如 http://localhost:3002',
        'firecrawlApiVersion': 'API 版本',
        'firecrawlApiVersion.hint': 'v2 或 v1。',
        'firecrawlApiVersion.invalid': '请填 v2 或 v1',
        'firecrawlApiKey': 'API key',
        'firecrawlApiKey.hint': '无鉴权的自托管实例留空。留空保存不会清除已存的 key。',
        'firecrawlApiKey.set': '已设置',
        'firecrawlApiKey.unset': '未设置',
        'firecrawlApiKeyEnv': 'API key 凭据名',
        'firecrawlApiKeyEnv.hint': '上面没填 key 时，从这个凭据或环境变量读取。',
        'firecrawlOnlyMainContent': '只取正文',
        'firecrawlOnlyMainContent.on': '去掉导航栏、页眉和页脚。',
        'firecrawlOnlyMainContent.off': '返回整个页面。',
        'firecrawlTimeoutMs': '抓取超时（毫秒）',
        'firecrawlTimeoutMs.hint': '要小于 web_fetch 的工具超时（默认 30000）。',
        'firecrawlMaxAgeMs': '缓存有效期（毫秒）',
        'firecrawlMaxAgeMs.hint': '仅 v2。接受不超过该时长的缓存；0 表示每次都重新抓取。',
        'firecrawlMaxBodyChars': '最大字符数',
        'firecrawlMaxBodyChars.hint': '返回给模型的 Markdown 超过该长度会截断。',
        'invalid': '这个值无效',
        'invalid.number': '请填整数，或留空使用默认值',
        'overridden': '已覆盖',
        'reset': '恢复默认',
        'save': '保存',
        'saving': '保存中…',
        'saveFailed': '设置未被接受，你的修改已保留，可修正后再保存。',
        'readonly': '当前部署的设置为只读。',
        'unavailable': '插件未运行，暂时无法配置。'
      }
    }

    /** A field that accepts one of a fixed set of drafts; empty clears it back to the default. */
    function enumField(field, allowed, toValue) {
      return {
        field: field,
        format: function (value) { return value === undefined || value === null ? '' : String(value) },
        parse: function (text) {
          var trimmed = text.trim()
          if (trimmed === '') return { kind: 'clear' }
          return allowed.indexOf(trimmed) >= 0 ? { kind: 'set', value: toValue ? toValue(trimmed) : trimmed } : undefined
        }
      }
    }

    function booleanField(field) {
      return {
        field: field,
        format: function (value) { return String(value !== false) },
        parse: function (text) { return { kind: 'set', value: text === 'true' } }
      }
    }

    var TEXT = ['searxngBaseURL', 'searxngEngines', 'searxngLanguage', 'searxngCategories', 'firecrawlBaseURL', 'firecrawlApiKeyEnv']
    var NUMBER = ['searxngMaxResults', 'searxngMaxPages', 'searxngTimeoutMs', 'firecrawlTimeoutMs', 'firecrawlMaxAgeMs', 'firecrawlMaxBodyChars']
    var ENUMS = {
      searxngSafeSearch: enumField('searxngSafeSearch', ['0', '1', '2'], Number),
      searxngTimeRange: enumField('searxngTimeRange', ['day', 'week', 'month', 'year']),
      firecrawlApiVersion: enumField('firecrawlApiVersion', ['v2', 'v1'])
    }

    var SEARXNG_FIELDS = ['searxngBaseURL', 'searxngEngines', 'searxngLanguage', 'searxngCategories', 'searxngSafeSearch', 'searxngTimeRange', 'searxngMaxResults', 'searxngMaxPages', 'searxngTimeoutMs']
    var FIRECRAWL_FIELDS = ['firecrawlBaseURL', 'firecrawlApiVersion', 'firecrawlApiKey', 'firecrawlApiKeyEnv', 'firecrawlOnlyMainContent', 'firecrawlTimeoutMs', 'firecrawlMaxAgeMs', 'firecrawlMaxBodyChars']

    function settingsForm(scope) {
      var specs = []
      TEXT.forEach(function (f) { specs.push(ui.settingsTextField(f)) })
      NUMBER.forEach(function (f) { specs.push(ui.settingsNumberField(f)) })
      Object.keys(ENUMS).forEach(function (f) { specs.push(ENUMS[f]) })
      specs.push(booleanField('firecrawlOnlyMainContent'))
      // The key is a `role('secret')` field: its literal never rides a form response, so the
      // control starts blank and a blank draft writes nothing.
      var secrets = [{
        field: 'firecrawlApiKey',
        write: function (text) { return scope.mutate([{ op: 'set', path: ['firecrawlApiKey'], value: text }]) }
      }]
      var form = new ui.SettingsFormModel(scope, specs, secrets)
      var store = form.bind(function () {
        var snapshot = scope.getSnapshot()
        var user = snapshot.user
        var fields = {}
        SEARXNG_FIELDS.concat(FIRECRAWL_FIELDS).forEach(function (f) { fields[f] = form.field(f) })
        return Object.assign({}, form.shell(), {
          fields: fields,
          keyConfigured: user !== null && typeof user === 'object' && Object.prototype.hasOwnProperty.call(user, 'firecrawlApiKey')
        })
      })
      return { form: form, store: store }
    }

    var headingStyle = { margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }
    var hintStyle = { margin: '0 0 12px', fontSize: '12px', opacity: 0.7 }
    var sectionStyle = { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }
    var rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }

    function invalidLabel(t, field) {
      if (ENUMS[field] !== undefined) return t(field + '.invalid')
      return NUMBER.indexOf(field) >= 0 ? t('invalid.number') : t('invalid')
    }

    function SettingsCard(props) {
      var t = props.t
      var state = props.useSettingsCard(function (snapshot) { return snapshot })
      if (props.view === 'summary') return null
      var disabled = !state.writable || state.saving

      function field(name) {
        if (name === 'firecrawlApiKey') {
          return h(ui.SettingsSecretField, {
            key: name,
            id: 'dsh-csf-' + name,
            label: t(name),
            hint: t(name + '.hint'),
            text: state.fields[name].text,
            disabled: disabled,
            configured: state.keyConfigured,
            stateLabel: t(state.keyConfigured ? 'firecrawlApiKey.set' : 'firecrawlApiKey.unset'),
            onEdit: function (text) { props.edit(name, text) }
          })
        }
        if (name === 'firecrawlOnlyMainContent') {
          var on = state.fields[name].text === 'true'
          return h('div', { key: name },
            h('div', { style: rowStyle },
              h('span', null, t(name)),
              h(ui.Switch, { checked: on, label: t(name), disabled: disabled, onChange: function (next) { props.edit(name, String(next)) } })),
            h('p', { style: hintStyle }, t(name + (on ? '.on' : '.off'))))
        }
        var f = state.fields[name]
        return h(ui.SettingsValueField, {
          key: name,
          id: 'dsh-csf-' + name,
          label: t(name),
          hint: t(name + '.hint'),
          text: f.text,
          overridden: f.overridden,
          invalid: f.invalid,
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: invalidLabel(t, name),
          numeric: NUMBER.indexOf(name) >= 0,
          disabled: disabled,
          onEdit: function (text) { props.edit(name, text) },
          onReset: function () { props.resetField(name) }
        })
      }

      function section(title, hint, names) {
        return h('div', { style: sectionStyle },
          h('div', null, h('h3', { style: headingStyle }, t(title)), h('p', { style: hintStyle }, t(hint))),
          names.map(field))
      }

      return h(ui.SettingsForm, {
        labels: { unavailable: t('unavailable'), readOnly: t('readonly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
        state: state,
        onSave: props.save,
        onDiscard: props.discard
      },
      section('section.searxng', 'section.searxng.hint', SEARXNG_FIELDS),
      section('section.firecrawl', 'section.firecrawl.hint', FIRECRAWL_FIELDS))
    }

    var name = 'dsh-custom-search-fetch-client'
    var inject = ['slots', 'locale', 'configForms']

    function apply(ctx) {
      ctx.effect(function* () {
        yield ctx.locale.register(NS, DICTS)
        var built = settingsForm(ctx.configForms.get(ENTRY_ID))
        yield function () { built.form.dispose() }
        yield ctx.slots.inject('plugins.bundle.config', function () {
          return ctx.slots.register({
            name: 'plugins.bundle.config',
            key: PACKAGE,
            locale: NS,
            inject: function () { return Object.assign({ hooks: { settingsCard: built.store } }, built.form.actions()) }
          }, SettingsCard)
        })
      }, 'dsh-custom-search-fetch settings card')
    }

    module.exports = { name: name, inject: inject, apply: apply }
    return module.exports
  }
})
