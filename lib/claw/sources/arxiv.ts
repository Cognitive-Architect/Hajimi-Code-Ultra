/**
 * Hajimi Claw - Arxiv Source Adapter
 * Arxiv论文抓取与分类筛选
 * @version 1.0.0
 * @implements CLAW-001 (日抓取量>100篇)
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ArxivPaper {
  id: string;
  arxivId: string;
  title: string;
  abstract: string;
  authors: ArxivAuthor[];
  categories: string[];
  primaryCategory: string;
  published: Date;
  updated?: Date;
  pdfUrl: string;
  absUrl: string;
  doi?: string;
  journalRef?: string;
  comment?: string;
  score?: number; // 相关性评分
  metadata?: ArxivMetadata;
}

export interface ArxivAuthor {
  name: string;
  affiliation?: string;
  orcid?: string;
}

export interface ArxivMetadata {
  pageCount?: number;
  wordCount?: number;
  figures?: number;
  tables?: number;
  references?: number;
  keywords?: string[];
}

export interface ArxivFetchOptions {
  categories?: string[];
  query?: string;
  startDate?: Date;
  endDate?: Date;
  maxResults?: number;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
  includeMetadata?: boolean;
}

export interface ArxivSearchResult {
  papers: ArxivPaper[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
}

// ============================================================================
// Configuration
// ============================================================================

const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';
const ARXIV_PDF_BASE = 'https://arxiv.org/pdf';
const ARXIV_ABS_BASE = 'https://arxiv.org/abs';

// CS领域分类
const CS_CATEGORIES = [
  'cs.AI', 'cs.AR', 'cs.CC', 'cs.CE', 'cs.CG', 'cs.CL', 'cs.CR', 'cs.CV',
  'cs.CY', 'cs.DB', 'cs.DC', 'cs.DL', 'cs.DM', 'cs.DS', 'cs.ET', 'cs.FL',
  'cs.GL', 'cs.GR', 'cs.GT', 'cs.HC', 'cs.IR', 'cs.IT', 'cs.LG', 'cs.LO',
  'cs.MA', 'cs.MM', 'cs.MS', 'cs.NA', 'cs.NE', 'cs.NI', 'cs.OS', 'cs.PF',
  'cs.PL', 'cs.RO', 'cs.SC', 'cs.SD', 'cs.SE', 'cs.SI', 'cs.SY'
];

// 热门AI/ML分类
const AI_CATEGORIES = [
  'cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'cs.IR', 'cs.NE', 'cs.RO'
];

const DEFAULT_OPTIONS: ArxivFetchOptions = {
  maxResults: 100,
  sortBy: 'submittedDate',
  sortOrder: 'descending',
  includeMetadata: false
};

// ============================================================================
// Arxiv Source Adapter
// ============================================================================

export class ArxivSource extends EventEmitter {
  private requestDelay = 3000; // arXiv建议3秒间隔
  private lastRequestTime = 0;

  // ========================================================================
  // Fetch Operations
  // ========================================================================

  async fetchPapers(options: ArxivFetchOptions = {}): Promise<ArxivSearchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    this.emit('fetch:started', { options: opts });

    // 构建查询
    const query = this.buildQuery(opts);
    const params = new URLSearchParams({
      search_query: query,
      start: '0',
      max_results: opts.maxResults!.toString(),
      sortBy: opts.sortBy!,
      sortOrder: opts.sortOrder!
    });

    const url = `${ARXIV_API_BASE}?${params}`;

    try {
      await this.enforceRequestDelay();

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Hajimi-Claw/1.0 (research aggregation)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      const result = this.parseAtomResponse(xml);

      // 可选：获取PDF元数据
      if (opts.includeMetadata && result.papers.length > 0) {
        for (const paper of result.papers.slice(0, 10)) {
          try {
            paper.metadata = await this.extractPDFMetadata(paper.arxivId);
          } catch (e) {
            this.emit('metadata:error', { paperId: paper.arxivId, error: e });
          }
        }
      }

      // 计算相关性评分
      if (opts.query) {
        result.papers.forEach(p => {
          p.score = this.calculateRelevanceScore(p, opts.query!);
        });
        result.papers.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      this.emit('fetch:completed', {
        count: result.papers.length,
        total: result.totalResults
      });

      return result;
    } catch (error) {
      this.emit('fetch:error', { error });
      throw error;
    }
  }

  async fetchByCategory(
    category: string, 
    daysBack = 7, 
    maxResults = 50
  ): Promise<ArxivPaper[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const result = await this.fetchPapers({
      categories: [category],
      startDate,
      endDate,
      maxResults,
      sortBy: 'submittedDate',
      sortOrder: 'descending'
    });

    return result.papers;
  }

  async fetchRecentAI(maxResults = 50): Promise<ArxivPaper[]> {
    const result = await this.fetchPapers({
      categories: AI_CATEGORIES,
      maxResults,
      sortBy: 'submittedDate',
      sortOrder: 'descending'
    });

    return result.papers;
  }

  // ========================================================================
  // Query Building
  // ========================================================================

  private buildQuery(options: ArxivFetchOptions): string {
    const parts: string[] = [];

    // 分类筛选
    if (options.categories && options.categories.length > 0) {
      const catQuery = options.categories
        .map(c => `cat:${c}`)
        .join(' OR ');
      parts.push(`(${catQuery})`);
    }

    // 关键词搜索
    if (options.query) {
      const searchQuery = options.query
        .split(/\s+/)
        .map(term => `all:${term}`)
        .join(' AND ');
      parts.push(`(${searchQuery})`);
    }

    // 日期范围
    if (options.startDate || options.endDate) {
      const start = options.startDate 
        ? options.startDate.toISOString().split('T')[0].replace(/-/g, '')
        : '20000101';
      const end = options.endDate
        ? options.endDate.toISOString().split('T')[0].replace(/-/g, '')
        : new Date().toISOString().split('T')[0].replace(/-/g, '');
      parts.push(`submittedDate:[${start}0000 TO ${end}2359]`);
    }

    return parts.join(' AND ') || 'all:*';
  }

  // ========================================================================
  // Response Parsing
  // ========================================================================

  private parseAtomResponse(xml: string): ArxivSearchResult {
    const result: ArxivSearchResult = {
      papers: [],
      totalResults: 0,
      startIndex: 0,
      itemsPerPage: 0
    };

    // 解析统计信息
    const totalMatch = xml.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/);
    const startMatch = xml.match(/<opensearch:startIndex>(\d+)<\/opensearch:startIndex>/);
    const perPageMatch = xml.match(/<opensearch:itemsPerPage>(\d+)<\/opensearch:itemsPerPage>/);

    if (totalMatch) result.totalResults = parseInt(totalMatch[1], 10);
    if (startMatch) result.startIndex = parseInt(startMatch[1], 10);
    if (perPageMatch) result.itemsPerPage = parseInt(perPageMatch[1], 10);

    // 解析条目
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];
      const paper = this.parseEntry(entryXml);
      if (paper) {
        result.papers.push(paper);
      }
    }

    return result;
  }

  private parseEntry(xml: string): ArxivPaper | null {
    try {
      const idMatch = xml.match(/<id>([^<]+)<\/id>/);
      if (!idMatch) return null;

      const arxivId = this.extractArxivId(idMatch[1]);
      
      const title = this.extractTag(xml, 'title');
      const summary = this.extractTag(xml, 'summary');
      const published = this.extractTag(xml, 'published');
      const updated = this.extractTag(xml, 'updated');
      
      // 提取作者
      const authors: ArxivAuthor[] = [];
      const authorRegex = /<author>([\s\S]*?)<\/author>/g;
      let authorMatch;
      while ((authorMatch = authorRegex.exec(xml)) !== null) {
        const name = this.extractTag(authorMatch[1], 'name');
        if (name) {
          authors.push({ name });
        }
      }

      // 提取分类
      const categories: string[] = [];
      let primaryCategory = '';
      const catRegex = /<category[^>]*term="([^"]+)"[^>]*>/g;
      const primaryCatRegex = /<arxiv:primary_category[^>]*term="([^"]+)"[^>]*>/;
      
      let catMatch;
      while ((catMatch = catRegex.exec(xml)) !== null) {
        categories.push(catMatch[1]);
      }
      
      const primaryMatch = xml.match(primaryCatRegex);
      primaryCategory = primaryMatch?.[1] || categories[0] || '';

      // 提取其他元数据
      const doi = this.extractTag(xml, 'arxiv:doi');
      const journalRef = this.extractTag(xml, 'arxiv:journal_ref');
      const comment = this.extractTag(xml, 'arxiv:comment');

      // 提取PDF链接
      let pdfUrl = `${ARXIV_PDF_BASE}/${arxivId}.pdf`;
      const pdfMatch = xml.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"[^>]*>/);
      if (pdfMatch) {
        pdfUrl = pdfMatch[1];
      }

      return {
        id: this.hash(arxivId),
        arxivId,
        title: this.cleanText(title || 'Untitled'),
        abstract: this.cleanText(summary || ''),
        authors,
        categories,
        primaryCategory,
        published: new Date(published || Date.now()),
        updated: updated ? new Date(updated) : undefined,
        pdfUrl,
        absUrl: `${ARXIV_ABS_BASE}/${arxivId}`,
        doi,
        journalRef,
        comment
      };
    } catch (error) {
      this.emit('parse:error', { error });
      return null;
    }
  }

  // ========================================================================
  // PDF Metadata Extraction
  // ========================================================================

  async extractPDFMetadata(arxivId: string): Promise<ArxivMetadata> {
    const metadata: ArxivMetadata = {};

    try {
      // 获取PDF文件头信息（不下载完整文件）
      const response = await fetch(`${ARXIV_PDF_BASE}/${arxivId}.pdf`, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Hajimi-Claw/1.0'
        }
      });

      if (response.ok) {
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
          // 估算页数（假设每页约50KB）
          metadata.pageCount = Math.round(parseInt(contentLength) / 51200);
        }
      }

      // 获取摘要页面的额外信息
      const absResponse = await fetch(`${ARXIV_ABS_BASE}/${arxivId}`, {
        headers: {
          'User-Agent': 'Hajimi-Claw/1.0'
        }
      });

      if (absResponse.ok) {
        const html = await absResponse.text();
        
        // 提取评论中的信息
        const commentMatch = html.match(/Comments:<\/span>\s*([^<]+)/);
        if (commentMatch) {
          const comment = commentMatch[1];
          
          // 提取页数
          const pagesMatch = comment.match(/(\d+)\s*pages?/i);
          if (pagesMatch) {
            metadata.pageCount = parseInt(pagesMatch[1]);
          }
          
          // 提取图表数
          const figsMatch = comment.match(/(\d+)\s*figures?/i);
          if (figsMatch) {
            metadata.figures = parseInt(figsMatch[1]);
          }
        }
      }
    } catch (error) {
      this.emit('pdf:error', { arxivId, error });
    }

    return metadata;
  }

  // ========================================================================
  // Relevance Scoring
  // ========================================================================

  private calculateRelevanceScore(paper: ArxivPaper, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    let score = 0;

    const titleLower = paper.title.toLowerCase();
    const abstractLower = paper.abstract.toLowerCase();

    queryTerms.forEach(term => {
      // 标题匹配权重高
      if (titleLower.includes(term)) {
        score += 10;
        // 完全匹配更高
        const regex = new RegExp(`\\b${term}\\b`, 'g');
        score += (titleLower.match(regex)?.length || 0) * 5;
      }

      // 摘要匹配
      if (abstractLower.includes(term)) {
        score += 3;
        const regex = new RegExp(`\\b${term}\\b`, 'g');
        score += (abstractLower.match(regex)?.length || 0);
      }

      // 分类匹配
      if (paper.categories.some(c => c.toLowerCase().includes(term))) {
        score += 2;
      }
    });

    // 时间衰减因子（越新越好）
    const daysSince = (Date.now() - paper.published.getTime()) / (1000 * 60 * 60 * 24);
    const timeFactor = Math.max(0.5, 1 - daysSince / 365);
    score *= timeFactor;

    // 作者数量因子（合作越多可能越重要）
    score += Math.min(paper.authors.length * 0.5, 5);

    return Math.round(score * 10) / 10;
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private extractArxivId(url: string): string {
    const match = url.match(/arxiv\.org\/abs\/([\d.]+)/) ||
                  url.match(/arxiv\.org\/pdf\/([\d.]+)/) ||
                  url.match(/\/([\d.]+)$/);
    return match?.[1] || url;
  }

  private extractTag(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\n\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hash(str: string): string {
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  private async enforceRequestDelay(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < this.requestDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.requestDelay - elapsed)
      );
    }
    
    this.lastRequestTime = Date.now();
  }

  // ========================================================================
  // Category Utilities
  // ========================================================================

  getCSCategories(): string[] {
    return [...CS_CATEGORIES];
  }

  getAICategories(): string[] {
    return [...AI_CATEGORIES];
  }

  getCategoryName(category: string): string {
    const names: Record<string, string> = {
      'cs.AI': 'Artificial Intelligence',
      'cs.CL': 'Computation and Language',
      'cs.CV': 'Computer Vision',
      'cs.LG': 'Machine Learning',
      'cs.IR': 'Information Retrieval',
      'cs.NE': 'Neural and Evolutionary Computing',
      'cs.RO': 'Robotics',
      'cs.SE': 'Software Engineering',
      'cs.DB': 'Databases',
      'cs.DC': 'Distributed Computing',
      'cs.NI': 'Networking and Internet Architecture',
      'cs.OS': 'Operating Systems',
      'cs.PL': 'Programming Languages',
      'cs.AR': 'Hardware Architecture',
      'cs.CR': 'Cryptography and Security',
      'cs.DS': 'Data Structures and Algorithms',
      'cs.GT': 'Computer Science and Game Theory',
      'cs.HC': 'Human-Computer Interaction',
      'cs.MM': 'Multimedia',
      'cs.SC': 'Symbolic Computation'
    };
    return names[category] || category;
  }

  // ========================================================================
  // Batch Operations
  // ========================================================================

  async batchFetchByIds(ids: string[]): Promise<ArxivPaper[]> {
    this.emit('batch:started', { count: ids.length });
    
    const papers: ArxivPaper[] = [];
    const batchSize = 10;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const query = batch.map(id => `id:${id}`).join(' OR ');
      
      try {
        const result = await this.fetchPapers({
          query,
          maxResults: batchSize
        });
        papers.push(...result.papers);
      } catch (error) {
        this.emit('batch:error', { batch, error });
      }

      this.emit('batch:progress', {
        completed: Math.min(i + batchSize, ids.length),
        total: ids.length
      });
    }

    this.emit('batch:completed', { count: papers.length });
    return papers;
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createArxivSource(): ArxivSource {
  return new ArxivSource();
}

export default ArxivSource;
