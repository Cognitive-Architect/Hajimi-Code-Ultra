/**
 * Hajimi Claw - Intelligence Crawling System
 * 情报抓取系统主入口
 * @version 1.0.0
 */

// Sources
export { GitHubSource, createGitHubSource } from './sources/github';
export type { GitHubRepo, GitHubTrendingItem, GitHubFetchOptions } from './sources/github';

export { BilibiliSource, createBilibiliSource } from './sources/bilibili';
export type { BilibiliVideo, BilibiliFetchOptions, AntiCrawlConfig } from './sources/bilibili';

export { RSSSourceAdapter, createRSSAdapter } from './sources/rss';
export type { RSSFeed, RSSItem, RSSSource, RSSFetchOptions } from './sources/rss';

export { ArxivSource, createArxivSource } from './sources/arxiv';
export type { ArxivPaper, ArxivAuthor, ArxivFetchOptions, ArxivSearchResult } from './sources/arxiv';

// Deduplication
export { SimHashDedup, createSimHashDedup } from './dedup/simhash';
export type { SimHashConfig, DuplicateResult, ContentFingerprint } from './dedup/simhash';

// Summary
export { LLMSummarizer, createLLMSummarizer } from './summary/llm';
export type { SummaryOptions, SummaryResult, SummaryQuality, LLMConfig, ContentItem } from './summary/llm';

// Pipeline
export { KnowledgePipeline, createKnowledgePipeline } from './pipeline/knowledge';
export type { KnowledgeItem, KnowledgeGraph, GraphNode, GraphEdge, PipelineConfig } from './pipeline/knowledge';

// Morning Read
export { MorningRead, createMorningRead } from './mode/morning-read';
export type { MorningReadConfig, MorningBriefing, BriefingSection, BriefingItem, UserProfile } from './mode/morning-read';

// ============================================================================
// Integration Helper
// ============================================================================

import { GitHubSource } from './sources/github';
import { BilibiliSource } from './sources/bilibili';
import { RSSSourceAdapter } from './sources/rss';
import { ArxivSource } from './sources/arxiv';
import { SimHashDedup } from './dedup/simhash';
import { LLMSummarizer } from './summary/llm';
import { KnowledgePipeline } from './pipeline/knowledge';
import { MorningRead } from './mode/morning-read';

export interface ClawConfig {
  github?: { tokens?: string[] };
  bilibili?: { usePlaywright?: boolean; proxy?: string };
  rss?: { sources?: Array<{ id: string; name: string; url: string }> };
  arxiv?: { categories?: string[] };
  dedup?: { threshold?: number; useBloomFilter?: boolean };
  llm?: { provider: 'openai' | 'anthropic' | 'openrouter' | 'local'; model: string; apiKey?: string };
  pipeline?: { dailyTarget?: number; minQuality?: number };
  morningRead?: { schedule?: string; userId: string };
}

export class HajimiClaw {
  github: GitHubSource;
  bilibili: BilibiliSource;
  rss: RSSSourceAdapter;
  arxiv: ArxivSource;
  dedup: SimHashDedup;
  summarizer: LLMSummarizer;
  pipeline: KnowledgePipeline;
  morningRead: MorningRead;

  constructor(config: ClawConfig) {
    this.github = new GitHubSource(config.github?.tokens);
    this.bilibili = new BilibiliSource(config.bilibili);
    this.rss = new RSSSourceAdapter();
    this.arxiv = new ArxivSource();
    this.dedup = new SimHashDedup(config.dedup);
    this.summarizer = new LLMSummarizer(config.llm || { provider: 'local', model: 'mock' });
    this.pipeline = new KnowledgePipeline(config.pipeline);
    this.morningRead = new MorningRead(
      config.morningRead?.userId || 'default',
      { schedule: config.morningRead?.schedule }
    );

    // 初始化RSS源
    if (config.rss?.sources) {
      for (const source of config.rss.sources) {
        this.rss.addSource({ ...source, category: 'tech' });
      }
    }
  }

  /**
   * 运行完整抓取流程
   */
  async runFullPipeline(): Promise<{
    fetched: number;
    deduplicated: number;
    stored: number;
  }> {
    const allItems: Array<{ id: string; text: string; source: string }> = [];

    // 1. 从各源抓取
    try {
      const githubTrending = await this.github.fetchTrending({ maxRepos: 25 });
      for (const repo of githubTrending) {
        allItems.push({
          id: `github:${repo.title}`,
          text: `${repo.title} ${repo.description}`,
          source: 'github'
        });
      }
    } catch (e) {
      console.error('GitHub fetch failed:', e);
    }

    try {
      const arxivPapers = await this.arxiv.fetchRecentAI(20);
      for (const paper of arxivPapers) {
        allItems.push({
          id: `arxiv:${paper.id}`,
          text: `${paper.title} ${paper.abstract}`,
          source: 'arxiv'
        });
      }
    } catch (e) {
      console.error('Arxiv fetch failed:', e);
    }

    // 2. 去重
    const unique: typeof allItems = [];
    const seen = new Set<string>();

    for (const item of allItems) {
      const result = this.dedup.checkDuplicate(item.text, item.id);
      if (!result.isDuplicate) {
        this.dedup.addFingerprint(item.id, item.text);
        unique.push(item);
      }
    }

    // 3. 存入知识流水线
    for (const item of unique) {
      await this.pipeline.processItem({
        id: item.id,
        source: item.source,
        sourceId: item.id,
        sourceUrl: '',
        title: item.text.slice(0, 100),
        content: item.text,
        publishedAt: new Date(),
        categories: [],
        tags: [],
        entities: [],
        quality: 0.7
      });
    }

    return {
      fetched: allItems.length,
      deduplicated: unique.length,
      stored: unique.length
    };
  }

  getStats() {
    return {
      pipeline: this.pipeline.getStats(),
      dedup: this.dedup.getStats()
    };
  }
}

export default HajimiClaw;
