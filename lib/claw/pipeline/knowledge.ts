/**
 * Hajimi Claw - Knowledge Pipeline
 * 知识沉淀流水线与关联图谱构建
 * @version 1.0.0
 * @implements CLAW-001 (日抓取量>100篇)
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface KnowledgeItem {
  id: string;
  source: 'github' | 'bilibili' | 'rss' | 'arxiv' | 'twitter' | string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  publishedAt: Date;
  fetchedAt: Date;
  categories: string[];
  tags: string[];
  entities: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  quality: number; // 质量评分 0-1
  engagement?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  metadata?: Record<string, any>;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: 'article' | 'entity' | 'tag' | 'author' | 'source';
  label: string;
  properties: Record<string, any>;
  weight: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'mentions' | 'related_to' | 'authored_by' | 'tagged_with' | 'from_source';
  weight: number;
  properties?: Record<string, any>;
}

export interface PipelineStats {
  totalProcessed: number;
  todayProcessed: number;
  bySource: Record<string, number>;
  avgQuality: number;
  dedupRate: number;
  lastRunAt?: Date;
}

export interface PipelineConfig {
  dailyTarget: number;      // 日抓取目标
  minQuality: number;       // 最低质量阈值
  autoCategorize: boolean;  // 自动分类
  buildGraph: boolean;      // 构建知识图谱
  retentionDays: number;    // 数据保留天数
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
  dailyTarget: 100,  // CLAW-001: 日抓取量>100篇
  minQuality: 0.6,
  autoCategorize: true,
  buildGraph: true,
  retentionDays: 90
};

// 技术分类词典
const TECH_CATEGORIES: Record<string, string[]> = {
  'AI/ML': ['人工智能', '机器学习', '深度学习', '神经网络', '大模型', 'llm', 'gpt', 'ai', 'machine learning', 'deep learning', 'transformer', 'llama', 'bert'],
  '编程': ['编程', '代码', '开发', '程序员', 'coding', 'programming', 'developer', 'software', '算法', 'algorithm', '数据结构'],
  '前端': ['前端', 'react', 'vue', 'angular', 'typescript', 'javascript', 'css', 'html', 'frontend', 'web'],
  '后端': ['后端', 'server', 'api', 'microservice', 'backend', 'database', 'redis', 'mysql', 'postgresql'],
  'DevOps': ['devops', 'docker', 'kubernetes', 'k8s', 'ci/cd', '云原生', 'cloud native', '容器', '部署'],
  '安全': ['安全', 'security', '加密', 'cryptography', '漏洞', '渗透测试', 'privacy', 'blockchain', '区块链'],
  '开源': ['开源', 'open source', 'github', 'contribution', 'license', '社区', 'community'],
  '移动': ['移动', 'mobile', 'ios', 'android', 'flutter', 'react native', 'app'],
  '数据': ['数据', 'data', '大数据', '数据分析', 'data science', '可视化', 'visualization']
};

// ============================================================================
// Knowledge Pipeline
// ============================================================================

export class KnowledgePipeline extends EventEmitter {
  private config: PipelineConfig;
  private items: Map<string, KnowledgeItem> = new Map();
  private graph: KnowledgeGraph = { nodes: [], edges: [] };
  private stats: PipelineStats = {
    totalProcessed: 0,
    todayProcessed: 0,
    bySource: {},
    avgQuality: 0,
    dedupRate: 0
  };

  constructor(config: Partial<PipelineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========================================================================
  // Core Pipeline
  // ========================================================================

  /**
   * 处理单个知识项
   */
  async processItem(
    rawData: Partial<KnowledgeItem>,
    dedupFn?: (item: KnowledgeItem) => boolean
  ): Promise<KnowledgeItem | null> {
    // 1. 标准化
    const normalized = this.normalize(rawData);
    
    // 2. 质量检查
    normalized.quality = this.assessQuality(normalized);
    if (normalized.quality < this.config.minQuality) {
      this.emit('item:rejected', { id: normalized.id, reason: 'low_quality' });
      return null;
    }

    // 3. 去重检查
    if (dedupFn && dedupFn(normalized)) {
      this.emit('item:duplicate', { id: normalized.id });
      this.stats.dedupRate = this.calculateDedupRate();
      return null;
    }

    // 4. 实体提取与标签生成
    normalized.entities = this.extractEntities(normalized);
    normalized.tags = this.generateTags(normalized);

    // 5. 自动分类
    if (this.config.autoCategorize) {
      normalized.categories = this.categorize(normalized);
    }

    // 6. 存储
    this.items.set(normalized.id, normalized);
    this.updateStats(normalized);

    // 7. 更新知识图谱
    if (this.config.buildGraph) {
      this.updateGraph(normalized);
    }

    this.emit('item:processed', { 
      id: normalized.id, 
      source: normalized.source,
      quality: normalized.quality 
    });

    return normalized;
  }

  /**
   * 批量处理
   */
  async processBatch(
    items: Partial<KnowledgeItem>[],
    dedupFn?: (item: KnowledgeItem) => boolean
  ): Promise<{
    processed: KnowledgeItem[];
    rejected: Array<{ item: Partial<KnowledgeItem>; reason: string }>;
    stats: { total: number; success: number; duplicate: number; lowQuality: number };
  }> {
    this.emit('batch:started', { count: items.length });

    const processed: KnowledgeItem[] = [];
    const rejected: Array<{ item: Partial<KnowledgeItem>; reason: string }> = [];
    const stats = { total: items.length, success: 0, duplicate: 0, lowQuality: 0 };

    // 批次处理（避免内存过载）
    const batchSize = 20;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (raw) => {
        try {
          const result = await this.processItem(raw, dedupFn);
          if (result) {
            processed.push(result);
            stats.success++;
          } else {
            // 判断是重复还是低质量
            const normalized = this.normalize(raw);
            if (normalized.quality < this.config.minQuality) {
              rejected.push({ item: raw, reason: 'low_quality' });
              stats.lowQuality++;
            } else {
              rejected.push({ item: raw, reason: 'duplicate' });
              stats.duplicate++;
            }
          }
        } catch (error) {
          rejected.push({ item: raw, reason: 'error' });
        }
      }));

      this.emit('batch:progress', {
        completed: Math.min(i + batchSize, items.length),
        total: items.length
      });
    }

    this.emit('batch:completed', stats);
    return { processed, rejected, stats };
  }

  // ========================================================================
  // Data Normalization
  // ========================================================================

  private normalize(raw: Partial<KnowledgeItem>): KnowledgeItem {
    const now = new Date();
    const id = raw.id || this.generateId(raw);

    return {
      id,
      source: raw.source || 'unknown',
      sourceId: raw.sourceId || id,
      sourceUrl: raw.sourceUrl || '',
      title: this.sanitizeText(raw.title || 'Untitled'),
      content: this.sanitizeText(raw.content || ''),
      summary: raw.summary ? this.sanitizeText(raw.summary) : undefined,
      author: raw.author,
      publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : now,
      fetchedAt: now,
      categories: raw.categories || [],
      tags: raw.tags || [],
      entities: raw.entities || [],
      sentiment: raw.sentiment,
      quality: raw.quality || 0,
      engagement: raw.engagement,
      metadata: raw.metadata
    };
  }

  private generateId(raw: Partial<KnowledgeItem>): string {
    const base = `${raw.source}:${raw.sourceId || raw.title}:${raw.publishedAt}`;
    return createHash('sha256').update(base).digest('hex').slice(0, 16);
  }

  private sanitizeText(text: string): string {
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ========================================================================
  // Quality Assessment
  // ========================================================================

  private assessQuality(item: KnowledgeItem): number {
    let score = 0;

    // 标题质量（长度适中、包含关键词）
    const titleLength = item.title.length;
    if (titleLength >= 10 && titleLength <= 200) score += 0.2;
    if (/[\u4e00-\u9fa5a-zA-Z]/.test(item.title)) score += 0.1;

    // 内容长度
    const contentLength = item.content.length;
    if (contentLength >= 100) score += 0.2;
    if (contentLength >= 500) score += 0.1;

    // 内容多样性
    const uniqueWords = new Set(item.content.split(/\s+/)).size;
    const diversity = uniqueWords / Math.max(contentLength / 10, 1);
    score += Math.min(diversity * 0.2, 0.2);

    // 时效性
    const daysOld = (Date.now() - item.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 1) score += 0.1;
    else if (daysOld < 7) score += 0.05;

    // 元数据完整性
    if (item.author) score += 0.05;
    if (item.sourceUrl) score += 0.05;

    // 互动数据（如有）
    if (item.engagement) {
      if (item.engagement.views && item.engagement.views > 1000) score += 0.1;
      if (item.engagement.likes && item.engagement.likes > 100) score += 0.05;
    }

    return Math.min(score, 1);
  }

  // ========================================================================
  // Entity & Tag Extraction
  // ========================================================================

  private extractEntities(item: KnowledgeItem): string[] {
    const entities: string[] = [];
    const text = `${item.title} ${item.content}`;

    // 提取技术实体（简单规则）
    const techEntityPatterns = [
      /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g, // 驼峰命名
      /\b([a-z]+[A-Z][a-zA-Z]*)\b/g, // 小驼峰
      /`([^`]+)`/g, // 代码标记
      /\b([A-Z]{2,})\b/g, // 缩写
    ];

    for (const pattern of techEntityPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const entity = match[1].trim();
        if (entity.length >= 2 && entity.length <= 50) {
          entities.push(entity);
        }
      }
    }

    // 提取公司/产品名
    const companyPatterns = [
      /\b(Google|Microsoft|Apple|Amazon|Meta|OpenAI|Anthropic|NVIDIA|Intel|AMD)\b/gi,
      /\b(GitHub|GitLab|Bitbucket|Stack Overflow|Hacker News)\b/gi,
    ];

    for (const pattern of companyPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push(match[1]);
      }
    }

    return [...new Set(entities)].slice(0, 20);
  }

  private generateTags(item: KnowledgeItem): string[] {
    const tags: string[] = [];
    const text = `${item.title} ${item.content}`.toLowerCase();

    // 基于分类词典匹配
    for (const [category, keywords] of Object.entries(TECH_CATEGORIES)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          tags.push(category);
          break;
        }
      }
    }

    // 从entities生成标签
    for (const entity of item.entities) {
      if (entity.length <= 20) {
        tags.push(entity.toLowerCase());
      }
    }

    return [...new Set(tags)].slice(0, 10);
  }

  // ========================================================================
  // Categorization
  // ========================================================================

  private categorize(item: KnowledgeItem): string[] {
    const categories: string[] = [];
    const text = `${item.title} ${item.content}`.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [category, keywords] of Object.entries(TECH_CATEGORIES)) {
      let score = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length;
        }
      }
      if (score > 0) {
        scores[category] = score;
      }
    }

    // 取前3个分类
    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return sorted.map(([cat]) => cat);
  }

  // ========================================================================
  // Knowledge Graph
  // ========================================================================

  private updateGraph(item: KnowledgeItem): void {
    // 添加文章节点
    this.addNode({
      id: item.id,
      type: 'article',
      label: item.title.slice(0, 50),
      properties: {
        source: item.source,
        quality: item.quality,
        publishedAt: item.publishedAt
      },
      weight: item.quality
    });

    // 添加实体节点和边
    for (const entity of item.entities) {
      const entityId = `entity:${entity.toLowerCase()}`;
      this.addNode({
        id: entityId,
        type: 'entity',
        label: entity,
        properties: {},
        weight: 1
      });
      this.addEdge({
        from: item.id,
        to: entityId,
        type: 'mentions',
        weight: 1
      });
    }

    // 添加标签节点和边
    for (const tag of item.tags) {
      const tagId = `tag:${tag}`;
      this.addNode({
        id: tagId,
        type: 'tag',
        label: tag,
        properties: {},
        weight: 1
      });
      this.addEdge({
        from: item.id,
        to: tagId,
        type: 'tagged_with',
        weight: 1
      });
    }

    // 添加作者节点
    if (item.author) {
      const authorId = `author:${item.author}`;
      this.addNode({
        id: authorId,
        type: 'author',
        label: item.author,
        properties: {},
        weight: 1
      });
      this.addEdge({
        from: item.id,
        to: authorId,
        type: 'authored_by',
        weight: 1
      });
    }

    // 添加来源节点
    const sourceId = `source:${item.source}`;
    this.addNode({
      id: sourceId,
      type: 'source',
      label: item.source,
      properties: {},
      weight: 1
    });
    this.addEdge({
      from: item.id,
      to: sourceId,
      type: 'from_source',
      weight: 1
    });

    // 计算文章间关联
    this.calculateRelatedArticles(item);
  }

  private addNode(node: GraphNode): void {
    const existing = this.graph.nodes.find(n => n.id === node.id);
    if (existing) {
      existing.weight += node.weight;
      Object.assign(existing.properties, node.properties);
    } else {
      this.graph.nodes.push(node);
    }
  }

  private addEdge(edge: GraphEdge): void {
    const existing = this.graph.edges.find(
      e => e.from === edge.from && e.to === edge.to && e.type === edge.type
    );
    if (existing) {
      existing.weight += edge.weight;
    } else {
      this.graph.edges.push(edge);
    }
  }

  private calculateRelatedArticles(newItem: KnowledgeItem): void {
    // 找到与新文章有共同标签/实体的文章
    for (const [id, item] of this.items) {
      if (id === newItem.id) continue;

      let similarity = 0;
      
      // 共同标签
      const commonTags = newItem.tags.filter(t => item.tags.includes(t));
      similarity += commonTags.length * 0.3;

      // 共同实体
      const commonEntities = newItem.entities.filter(e => item.entities.includes(e));
      similarity += commonEntities.length * 0.5;

      // 同作者
      if (newItem.author && newItem.author === item.author) {
        similarity += 0.2;
      }

      if (similarity >= 0.5) {
        this.addEdge({
          from: newItem.id,
          to: id,
          type: 'related_to',
          weight: similarity
        });
      }
    }
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  private updateStats(item: KnowledgeItem): void {
    this.stats.totalProcessed++;
    this.stats.todayProcessed++;
    this.stats.bySource[item.source] = (this.stats.bySource[item.source] || 0) + 1;
    
    // 更新平均质量
    const totalQuality = this.stats.avgQuality * (this.stats.totalProcessed - 1) + item.quality;
    this.stats.avgQuality = totalQuality / this.stats.totalProcessed;
  }

  private calculateDedupRate(): number {
    if (this.stats.totalProcessed === 0) return 0;
    return this.stats.totalProcessed / (this.stats.totalProcessed + this.items.size);
  }

  getStats(): PipelineStats {
    return { ...this.stats };
  }

  getGraph(): KnowledgeGraph {
    return {
      nodes: [...this.graph.nodes],
      edges: [...this.graph.edges]
    };
  }

  // ========================================================================
  // Query & Retrieval
  // ========================================================================

  getItem(id: string): KnowledgeItem | undefined {
    return this.items.get(id);
  }

  query(filters: {
    sources?: string[];
    categories?: string[];
    tags?: string[];
    since?: Date;
    until?: Date;
    minQuality?: number;
    limit?: number;
  }): KnowledgeItem[] {
    let results = Array.from(this.items.values());

    if (filters.sources) {
      results = results.filter(i => filters.sources!.includes(i.source));
    }
    if (filters.categories) {
      results = results.filter(i => 
        i.categories.some(c => filters.categories!.includes(c))
      );
    }
    if (filters.tags) {
      results = results.filter(i => 
        i.tags.some(t => filters.tags!.includes(t))
      );
    }
    if (filters.since) {
      results = results.filter(i => i.publishedAt >= filters.since!);
    }
    if (filters.until) {
      results = results.filter(i => i.publishedAt <= filters.until!);
    }
    if (filters.minQuality) {
      results = results.filter(i => i.quality >= filters.minQuality!);
    }

    // 按质量和时间排序
    results.sort((a, b) => {
      const qualityDiff = b.quality - a.quality;
      if (Math.abs(qualityDiff) > 0.1) return qualityDiff;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });

    return results.slice(0, filters.limit || results.length);
  }

  getRelatedItems(id: string, limit = 5): KnowledgeItem[] {
    const related = this.graph.edges
      .filter(e => e.from === id && e.type === 'related_to')
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit)
      .map(e => this.items.get(e.to))
      .filter((i): i is KnowledgeItem => i !== undefined);

    return related;
  }

  // ========================================================================
  // Daily Target Check
  // ========================================================================

  checkDailyTarget(): {
    met: boolean;
    current: number;
    target: number;
    remaining: number;
    percentage: number;
  } {
    const current = this.stats.todayProcessed;
    const target = this.config.dailyTarget;
    
    return {
      met: current >= target,
      current,
      target,
      remaining: Math.max(0, target - current),
      percentage: Math.min(100, (current / target) * 100)
    };
  }

  resetDailyCount(): void {
    this.stats.todayProcessed = 0;
    this.stats.lastRunAt = new Date();
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  exportData(): {
    items: KnowledgeItem[];
    graph: KnowledgeGraph;
    stats: PipelineStats;
  } {
    return {
      items: Array.from(this.items.values()),
      graph: this.getGraph(),
      stats: this.getStats()
    };
  }

  importData(data: {
    items: KnowledgeItem[];
    graph: KnowledgeGraph;
    stats: PipelineStats;
  }): void {
    for (const item of data.items) {
      this.items.set(item.id, item);
    }
    this.graph = data.graph;
    this.stats = data.stats;
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createKnowledgePipeline(config?: Partial<PipelineConfig>): KnowledgePipeline {
  return new KnowledgePipeline(config);
}

export default KnowledgePipeline;
