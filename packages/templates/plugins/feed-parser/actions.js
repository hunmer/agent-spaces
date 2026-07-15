'use strict'

const {
  parseFeed,
  parseRssFeed,
  parseAtomFeed,
  parseRdfFeed,
  parseJsonFeed,
  detectAtomFeed,
  detectJsonFeed,
  detectRdfFeed,
  detectRssFeed,
} = require('feedsmith')

/**
 * 订阅源解析器插件（基于 feedsmith）
 * - feed_fetch:  URL 解析节点 —— 输入 URL 抓取原始内容，并探测格式
 * - feed_parse:  内容解析节点 —— 输入原始文本，按指定/自动识别的格式解析为结构化数据
 *
 * 参考 README1.md (Feedsmith) 的 parseFeed / parseRssFeed / parseAtomFeed 设计。
 * 依赖通过插件 package.json 的 dependencies 声明，加载时由宿主自动 npm install。
 */

const TYPE_AUTO = 'auto'
const TYPE_OPTIONS = [TYPE_AUTO, 'rss', 'atom', 'rdf', 'json']

/**
 * 用 feedsmith 的 detect* 函数探测格式
 * @returns {'rss'|'atom'|'rdf'|'json'|null}
 */
function detectFormat(content) {
  const text = String(content || '')
  if (detectRssFeed(text)) return 'rss'
  if (detectAtomFeed(text)) return 'atom'
  if (detectRdfFeed(text)) return 'rdf'
  if (detectJsonFeed(text)) return 'json'
  return null
}

/**
 * 按指定格式解析；格式为空时用 parseFeed 自动识别
 */
function dispatchParse(format, content) {
  switch (format) {
    case 'rss': return { format, feed: parseRssFeed(content) }
    case 'atom': return { format, feed: parseAtomFeed(content) }
    case 'rdf': return { format, feed: parseRdfFeed(content) }
    case 'json': return { format, feed: parseJsonFeed(content) }
    default: return parseFeed(content)
  }
}

/**
 * 归一化条目字段：feedsmith 的 Atom 用 entries，其它用 items。
 * 这里统一补一个 items 别名，同时保留原始 entries，方便下游访问。
 */
function normalizeItems(feed) {
  if (!feed) return feed
  if (!Array.isArray(feed.items) && Array.isArray(feed.entries)) {
    feed.items = feed.entries
  }
  return feed
}

function countItems(feed) {
  if (Array.isArray(feed && feed.items)) return feed.items.length
  if (Array.isArray(feed && feed.entries)) return feed.entries.length
  return 0
}

// 取首页/备用链接，兼容各格式字段差异
function pickLink(feed) {
  if (!feed) return ''
  if (typeof feed.link === 'string') return feed.link
  if (Array.isArray(feed.links) && feed.links.length) {
    const alt = feed.links.find((l) => !l.rel || l.rel === 'alternate')
    return (alt && alt.href) || feed.links[0].href || ''
  }
  return feed.home_page_url || ''
}

module.exports = (t) => [
  {
    name: 'feed_fetch',
    label: t('action.fetch.label', 'Fetch Feed from URL'),
    category: t('category', 'Feed Parser'),
    icon: 'Rss',
    description: t('action.fetch.description', 'Fetch a feed URL and return the raw content with detected format. Supports RSS / Atom / RDF / JSON Feed.'),
    properties: [
      {
        key: 'url',
        label: t('field.url.label', 'URL'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.url.tooltip', 'Feed URL, e.g. https://example.com/feed.xml'),
      },
      {
        key: 'type',
        label: t('field.type.label', 'Feed Type'),
        type: 'select',
        dataType: 'string',
        options: TYPE_OPTIONS,
        default: TYPE_AUTO,
        tooltip: t('field.type.tooltip', 'Force a specific feed format, or auto-detect.'),
      },
      {
        key: 'timeout',
        label: t('field.timeout.label', 'Timeout (ms)'),
        type: 'number',
        dataType: 'number',
        default: 30000,
        tooltip: t('field.timeout.tooltip', 'Request timeout in milliseconds.'),
      },
      {
        key: 'headers',
        label: t('field.headers.label', 'Headers'),
        type: 'object',
        dataType: 'object',
        tooltip: t('field.headers.tooltip', 'Custom request headers (JSON object), e.g. {"User-Agent":"..."}'),
      },
      {
        key: 'encoding',
        label: t('field.encoding.label', 'Encoding'),
        type: 'text',
        dataType: 'string',
        default: 'utf-8',
        tooltip: t('field.encoding.tooltip', 'Response encoding, e.g. utf-8 / gbk'),
      },
      {
        key: 'proxy',
        label: t('field.proxy.label', 'HTTP Proxy'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.proxy.tooltip', 'HTTP(S) proxy URL, e.g. http://user:pass@host:8080. Leave empty for direct connection.'),
      },
    ],
    outputs: [
      { key: 'format', type: 'string' },
      { key: 'content', type: 'string' },
      { key: 'url', type: 'string' },
    ],
    run: async (ctx, args) => {
      if (!args.url) {
        return { success: false, message: t('message.urlRequired', 'URL is required') }
      }
      const timeout = Number(args.timeout) || 30000
      const content = await ctx.api.fetchText(args.url, {
        headers: args.headers,
        encoding: args.encoding,
        timeout,
        proxy: args.proxy || undefined,
      })
      const format = args.type && args.type !== TYPE_AUTO ? args.type : detectFormat(content)
      ctx.logger.info(`feed_fetch url=${args.url} type=${args.type || TYPE_AUTO} detected=${format} length=${content.length}`)
      return {
        success: true,
        message: t('message.fetched', 'Feed fetched ({format}, {length} chars)').replace('{format}', format || 'unknown').replace('{length}', content.length),
        data: { format, content, url: args.url },
      }
    },
  },

  {
    name: 'feed_parse',
    label: t('action.parse.label', 'Parse Feed Content'),
    category: t('category', 'Feed Parser'),
    icon: 'FileText',
    description: t('action.parse.description', 'Parse feed text content into a structured object (title, items, authors, dates, ...). Supports RSS / Atom / RDF / JSON Feed.'),
    properties: [
      {
        key: 'content',
        label: t('field.content.label', 'Feed Content'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.content.tooltip', 'Raw feed text (XML or JSON). Usually connected from the Fetch Feed node output.'),
      },
      {
        key: 'type',
        label: t('field.type.label', 'Feed Type'),
        type: 'select',
        dataType: 'string',
        options: TYPE_OPTIONS,
        default: TYPE_AUTO,
        tooltip: t('field.type.tooltip', 'Force a specific feed format, or auto-detect.'),
      },
      {
        key: 'limit',
        label: t('field.limit.label', 'Item Limit'),
        type: 'number',
        dataType: 'number',
        default: 0,
        tooltip: t('field.limit.tooltip', 'Max number of items to keep. 0 = keep all.'),
      },
    ],
    outputs: [
      { key: 'format', type: 'string' },
      { key: 'title', type: 'string' },
      { key: 'description', type: 'string' },
      { key: 'link', type: 'string' },
      { key: 'itemCount', type: 'number', dataType: 'number' },
      { key: 'feed', type: 'object', dataType: 'object' },
    ],
    run: async (ctx, args) => {
      const content = args.content
      if (!content) {
        return { success: false, message: t('message.contentRequired', 'Feed content is required') }
      }
      const forcedType = args.type && args.type !== TYPE_AUTO ? args.type : null
      let parsed
      try {
        parsed = dispatchParse(forcedType, content)
      } catch (err) {
        return {
          success: false,
          message: t('message.parseFailed', 'Failed to parse feed: {error}').replace('{error}', err instanceof Error ? err.message : String(err)),
        }
      }
      const format = parsed.format
      const feed = normalizeItems(parsed.feed)
      const limit = Number(args.limit) || 0
      if (limit > 0 && Array.isArray(feed.items) && feed.items.length > limit) {
        feed.items = feed.items.slice(0, limit)
      }
      ctx.logger.info(`feed_parse type=${args.type || TYPE_AUTO} format=${format} count=${countItems(feed)}`)
      return {
        success: true,
        message: t('message.parsed', 'Feed parsed: {format}, {count} items').replace('{format}', format).replace('{count}', countItems(feed)),
        data: {
          format,
          title: feed.title || '',
          description: feed.description || feed.subtitle || '',
          link: pickLink(feed),
          itemCount: countItems(feed),
          feed,
        },
      }
    },
  },
]
