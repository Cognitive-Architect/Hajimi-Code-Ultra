/**
 * Hajimi Claw - RSS/Atom Source Adapter
 * RSS/Atom订阅抓取与增量更新
 * @version 1.0.0
 * @implements CLAW-001 (日抓取量>100篇)
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RSSFeed {
  id: string;
  url: string;
  title: string;
  description?: string;
  link?: string;
  language?: string;
  lastBuildDate?: string;
  ttl?: number;
  items: RSSItem[];
}

export interface RSSItem {
  id: string;
  title: string;
  description: string;
  content?: string;
  link: string;
  pubDate: Date;
  author?: string;
  categories: string[];
  guid: string;
  enclosure?: {
    url: string;
    type: string;
    length?: number;
  };
}

export interface RSSFetchOptions {
  timeout?: number;
  maxItems?: number;
  followRedirects?: boolean;
  userAgent?: string;
}

export interface RSSSource {
  id: string;
  name: string;
  url: string;
  category?: string;
  priority?: number;
  fetchInterval?: number; // 秒
  lastFetched?: Date;
  lastETag?: string;
  lastModified?: string;
  itemCount?: number;
}

export interface RSSCache {
  etag?: string;
  lastModified?: string;
  itemHashes: Set<string>;
  lastFetchTime: Date;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_OPTIONS: RSSFetchOptions = {
  timeout: 30000,
  maxItems: 50,
  followRedirects: true,
  userAgent: 'Hajimi-Claw/1.0 RSS Aggregator'
};

const DEFAULT_FETCH_INTERVAL = 1800; // 30分钟

// ============================================================================
// RSS Source Adapter
// ============================================================================

export class RSSSourceAdapter extends EventEmitter {
  private sources: Map<string, RSSSource> = new Map();
  private cache: Map<string, RSSCache> = new Map();
  private fetchTimers: Map<string, NodeJS.Timeout> = new Map();
  private defaultOptions: RSSFetchOptions;

  constructor(options: RSSFetchOptions = {}) {
    super();
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options };
  }

  // ========================================================================
  // Source Management
  // ========================================================================

  addSource(source: RSSSource): void {
    this.sources.set(source.id, {
      ...source,
      fetchInterval: source.fetchInterval || DEFAULT_FETCH_INTERVAL,
      priority: source.priority || 0
    });
    
    // 初始化缓存
    if (!this.cache.has(source.id)) {
      this.cache.set(source.id, {
        itemHashes: new Set(),
        lastFetchTime: new Date(0)
      });
    }

    this.emit('source:added', { id: source.id, name: source.name });
  }

  removeSource(id: string): boolean {
    // 清除定时器
    const timer = this.fetchTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.fetchTimers.delete(id);
    }

    const result = this.sources.delete(id);
    this.cache.delete(id);
    
    if (result) {
      this.emit('source:removed', { id });
    }
    
    return result;
  }

  getSource(id: string): RSSSource | undefined {
    return this.sources.get(id);
  }

  getAllSources(): RSSSource[] {
    return Array.from(this.sources.values());
  }

  updateSource(id: string, updates: Partial<RSSSource>): boolean {
    const source = this.sources.get(id);
    if (!source) return false;

    this.sources.set(id, { ...source, ...updates });
    this.emit('source:updated', { id, updates });
    return true;
  }

  // ========================================================================
  // Fetch Operations
  // ========================================================================

  async fetchFeed(
    sourceId: string, 
    options: RSSFetchOptions = {}
  ): Promise<RSSFeed | null> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const opts = { ...this.defaultOptions, ...options };
    const cache = this.cache.get(sourceId)!;

    this.emit('fetch:started', { sourceId, url: source.url });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

      // 设置条件请求头
      const headers: Record<string, string> = {
        'User-Agent': opts.userAgent!,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      };

      if (cache.etag) {
        headers['If-None-Match'] = cache.etag;
      }
      if (cache.lastModified) {
        headers['If-Modified-Since'] = cache.lastModified;
      }

      const response = await fetch(source.url, {
        headers,
        signal: controller.signal,
        redirect: opts.followRedirects ? 'follow' : 'manual'
      });

      clearTimeout(timeoutId);

      // 304 Not Modified - 使用缓存
      if (response.status === 304) {
        this.emit('fetch:not-modified', { sourceId });
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 更新缓存元数据
      cache.etag = response.headers.get('ETag') || undefined;
      cache.lastModified = response.headers.get('Last-Modified') || undefined;
      cache.lastFetchTime = new Date();

      const xml = await response.text();
      const feed = this.parseXML(xml, source.url, opts.maxItems!);

      // 过滤已存在的项目（增量更新）
      const newItems = this.filterNewItems(feed.items, cache.itemHashes);
      feed.items = newItems;

      // 更新源统计
      source.itemCount = (source.itemCount || 0) + newItems.length;
      source.lastFetched = new Date();

      this.emit('fetch:completed', { 
        sourceId, 
        totalItems: feed.items.length,
        newItems: newItems.length 
      });

      return feed;
    } catch (error) {
      this.emit('fetch:error', { sourceId, error });
      throw error;
    }
  }

  async fetchAll(
    options: RSSFetchOptions & { parallel?: boolean } = {}
  ): Promise<Map<string, RSSFeed>> {
    const { parallel = true, ...fetchOpts } = options;
    const results = new Map<string, RSSFeed>();

    this.emit('fetch-all:started', { 
      count: this.sources.size, 
      parallel 
    });

    const sourceIds = Array.from(this.sources.keys());

    if (parallel) {
      // 并行获取（有限制）
      const batchSize = 5;
      for (let i = 0; i < sourceIds.length; i += batchSize) {
        const batch = sourceIds.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(id => this.fetchFeed(id, fetchOpts))
        );

        batchResults.forEach((result, index) => {
          const id = batch[index];
          if (result.status === 'fulfilled' && result.value) {
            results.set(id, result.value);
          }
        });
      }
    } else {
      // 串行获取
      for (const id of sourceIds) {
        try {
          const feed = await this.fetchFeed(id, fetchOpts);
          if (feed) {
            results.set(id, feed);
          }
        } catch (error) {
          this.emit('fetch-all:error', { sourceId: id, error });
        }
      }
    }

    this.emit('fetch-all:completed', { 
      requested: sourceIds.length,
      succeeded: results.size 
    });

    return results;
  }

  // ========================================================================
  // XML Parsing
  // ========================================================================

  private parseXML(xml: string, sourceUrl: string, maxItems: number): RSSFeed {
    // 检测RSS或Atom
    const isAtom = xml.includes('<feed') || xml.includes('xmlns="http://www.w3.org/2005/Atom"');
    const isRSS = xml.includes('<rss') || xml.includes('<channel');

    if (isAtom) {
      return this.parseAtom(xml, sourceUrl, maxItems);
    } else if (isRSS) {
      return this.parseRSS(xml, sourceUrl, maxItems);
    } else {
      throw new Error('Unknown feed format');
    }
  }

  private parseRSS(xml: string, sourceUrl: string, maxItems: number): RSSFeed {
    const feed: RSSFeed = {
      id: this.hash(sourceUrl),
      url: sourceUrl,
      title: '',
      items: []
    };

    // 提取频道信息
    feed.title = this.extractTag(xml, 'title') || 'Untitled Feed';
    feed.description = this.extractTag(xml, 'description');
    feed.link = this.extractTag(xml, 'link');
    feed.language = this.extractTag(xml, 'language');
    feed.lastBuildDate = this.extractTag(xml, 'lastBuildDate') || 
                         this.extractTag(xml, 'pubDate');
    
    const ttl = this.extractTag(xml, 'ttl');
    if (ttl) feed.ttl = parseInt(ttl, 10);

    // 提取项目
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;

    while ((match = itemRegex.exec(xml)) !== null && count < maxItems) {
      const itemXml = match[1];
      const item = this.parseRSSItem(itemXml);
      feed.items.push(item);
      count++;
    }

    return feed;
  }

  private parseAtom(xml: string, sourceUrl: string, maxItems: number): RSSFeed {
    const feed: RSSFeed = {
      id: this.hash(sourceUrl),
      url: sourceUrl,
      title: '',
      items: []
    };

    // 提取Feed信息
    feed.title = this.extractTag(xml, 'title') || 'Untitled Feed';
    feed.description = this.extractTag(xml, 'subtitle');
    
    const linkMatch = xml.match(/<link[^>]*href="([^"]+)"[^>]*>/);
    feed.link = linkMatch?.[1];
    
    feed.lastBuildDate = this.extractTag(xml, 'updated');

    // 提取条目
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    let count = 0;

    while ((match = entryRegex.exec(xml)) !== null && count < maxItems) {
      const entryXml = match[1];
      const item = this.parseAtomEntry(entryXml);
      feed.items.push(item);
      count++;
    }

    return feed;
  }

  private parseRSSItem(xml: string): RSSItem {
    const title = this.extractTag(xml, 'title') || 'Untitled';
    const description = this.extractTag(xml, 'description') || 
                       this.extractTag(xml, 'content:encoded') || '';
    const link = this.extractTag(xml, 'link') || '';
    const pubDateStr = this.extractTag(xml, 'pubDate') || 
                       this.extractTag(xml, 'dc:date');
    const author = this.extractTag(xml, 'author') || 
                   this.extractTag(xml, 'dc:creator');
    const guid = this.extractTag(xml, 'guid') || link;

    // 提取分类
    const categories: string[] = [];
    const catRegex = /<category[^>]*>([^<]*)<\/category>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(xml)) !== null) {
      categories.push(this.unescapeXML(catMatch[1].trim()));
    }

    // 提取附件
    let enclosure;
    const encMatch = xml.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="([^"]+)"[^>]*>/);
    if (encMatch) {
      enclosure = {
        url: encMatch[1],
        type: encMatch[2]
      };
    }

    return {
      id: this.hash(guid),
      title: this.unescapeXML(title),
      description: this.cleanHTML(description),
      link,
      pubDate: pubDateStr ? new Date(pubDateStr) : new Date(),
      author: author ? this.unescapeXML(author) : undefined,
      categories,
      guid,
      enclosure
    };
  }

  private parseAtomEntry(xml: string): RSSItem {
    const title = this.extractTag(xml, 'title') || 'Untitled';
    const content = this.extractTag(xml, 'content') || 
                    this.extractTag(xml, 'summary') || '';
    
    const linkMatch = xml.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"[^>]*>/) ||
                      xml.match(/<link[^>]*href="([^"]+)"[^>]*>/);
    const link = linkMatch?.[1] || '';
    
    const id = this.extractTag(xml, 'id') || '';
    const updated = this.extractTag(xml, 'updated');
    const published = this.extractTag(xml, 'published');
    const author = this.extractTag(xml, 'name', 'author');

    // 提取分类
    const categories: string[] = [];
    const catRegex = /<category[^>]*term="([^"]+)"[^>]*\/>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(xml)) !== null) {
      categories.push(catMatch[1]);
    }

    return {
      id: this.hash(id),
      title: this.unescapeXML(title),
      description: this.cleanHTML(content),
      content: this.unescapeXML(content),
      link,
      pubDate: new Date(published || updated || Date.now()),
      author: author ? this.unescapeXML(author) : undefined,
      categories,
      guid: id
    };
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private extractTag(xml: string, tag: string, parentTag?: string): string | undefined {
    let searchXml = xml;
    
    // 如果在父标签中搜索
    if (parentTag) {
      const parentRegex = new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)<\\/${parentTag}>`);
      const parentMatch = xml.match(parentRegex);
      if (!parentMatch) return undefined;
      searchXml = parentMatch[1];
    }

    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = searchXml.match(regex);
    
    return match ? match[1].trim() : undefined;
  }

  private cleanHTML(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private unescapeXML(str: string): string {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  private hash(str: string): string {
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  private filterNewItems(items: RSSItem[], seenHashes: Set<string>): RSSItem[] {
    return items.filter(item => {
      const contentHash = this.hash(item.title + item.description);
      if (seenHashes.has(contentHash)) {
        return false;
      }
      seenHashes.add(contentHash);
      return true;
    });
  }

  // ========================================================================
  // Scheduled Polling
  // ========================================================================

  startPolling(sourceId: string, callback?: (feed: RSSFeed) => void): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return false;

    // 清除现有定时器
    this.stopPolling(sourceId);

    const intervalMs = (source.fetchInterval || DEFAULT_FETCH_INTERVAL) * 1000;

    const timer = setInterval(async () => {
      try {
        const feed = await this.fetchFeed(sourceId);
        if (feed && callback) {
          callback(feed);
        }
      } catch (error) {
        this.emit('polling:error', { sourceId, error });
      }
    }, intervalMs);

    this.fetchTimers.set(sourceId, timer);
    this.emit('polling:started', { sourceId, interval: intervalMs });

    return true;
  }

  stopPolling(sourceId: string): boolean {
    const timer = this.fetchTimers.get(sourceId);
    if (timer) {
      clearInterval(timer);
      this.fetchTimers.delete(sourceId);
      this.emit('polling:stopped', { sourceId });
      return true;
    }
    return false;
  }

  startAllPolling(callback?: (sourceId: string, feed: RSSFeed) => void): void {
    for (const [id] of this.sources) {
      this.startPolling(id, feed => callback?.(id, feed));
    }
  }

  stopAllPolling(): void {
    for (const [id] of this.fetchTimers) {
      this.stopPolling(id);
    }
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getStats(): {
    sourceCount: number;
    activePolls: number;
    totalCachedItems: number;
    sources: Array<{
      id: string;
      itemCount: number;
      lastFetched?: Date;
    }>;
  } {
    const sources = Array.from(this.sources.values()).map(s => ({
      id: s.id,
      itemCount: s.itemCount || 0,
      lastFetched: s.lastFetched
    }));

    return {
      sourceCount: this.sources.size,
      activePolls: this.fetchTimers.size,
      totalCachedItems: sources.reduce((sum, s) => sum + s.itemCount, 0),
      sources
    };
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createRSSAdapter(options?: RSSFetchOptions): RSSSourceAdapter {
  return new RSSSourceAdapter(options);
}

export default RSSSourceAdapter;
