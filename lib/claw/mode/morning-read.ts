/**
 * Hajimi Claw - Alice Morning Read Mode
 * Alice晨读模式与个性化推荐
 * @version 1.0.0
 * @implements CLAW-003 (简报生成<60s)
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MorningReadConfig {
  schedule: string;           // Cron表达式
  maxItems: number;           // 最大条目数
  readingTime: number;        // 预计阅读时间（分钟）
  sources: string[];          // 启用的数据源
  categories: string[];       // 关注分类
  personalization: {
    enabled: boolean;
    interestDecay: number;    // 兴趣衰减系数
    diversityRatio: number;   // 多样性比例
    recencyWeight: number;    // 时效性权重
  };
  output: {
    format: 'markdown' | 'html' | 'json';
    includeHighlights: boolean;
    includeTrending: boolean;
    includeRecommended: boolean;
  };
}

export interface MorningBriefing {
  id: string;
  generatedAt: Date;
  readingTime: number;
  sections: BriefingSection[];
  highlights: HighlightItem[];
  recommended: RecommendedItem[];
  stats: BriefingStats;
  metadata: {
    totalSources: number;
    personalizationScore: number;
    processingTime: number;
  };
}

export interface BriefingSection {
  title: string;
  icon?: string;
  items: BriefingItem[];
}

export interface BriefingItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: Date;
  category: string;
  tags: string[];
  relevanceScore: number;
  readingTime?: number;       // 预计阅读时间（秒）
}

export interface HighlightItem {
  id: string;
  title: string;
  reason: string;             // 推荐理由
  type: 'trending' | 'breaking' | 'editor_pick';
  source: string;
  url: string;
}

export interface RecommendedItem {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  basedOn: string[];          // 基于哪些兴趣
}

export interface BriefingStats {
  totalItems: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  avgQuality: number;
}

export interface UserProfile {
  id: string;
  interests: Map<string, number>;     // 兴趣 -> 权重
  readHistory: Array<{
    itemId: string;
    timestamp: Date;
    dwellTime: number;
    liked: boolean;
  }>;
  preferredCategories: string[];
  preferredSources: string[];
  lastActive: Date;
}

export interface CronJob {
  stop: () => void;
  nextRun: () => Date | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MorningReadConfig = {
  schedule: '0 8 * * *',      // 每天上午8点
  maxItems: 20,
  readingTime: 5,
  sources: ['github', 'bilibili', 'rss', 'arxiv'],
  categories: ['AI/ML', '编程', '开源', 'DevOps'],
  personalization: {
    enabled: true,
    interestDecay: 0.95,
    diversityRatio: 0.3,
    recencyWeight: 0.4
  },
  output: {
    format: 'markdown',
    includeHighlights: true,
    includeTrending: true,
    includeRecommended: true
  }
};

// ============================================================================
// Alice Morning Read
// ============================================================================

export class MorningRead extends EventEmitter {
  private config: MorningReadConfig;
  private userProfile: UserProfile;
  private briefingHistory: MorningBriefing[] = [];
  private currentJob?: CronJob;
  private isGenerating = false;

  constructor(
    userId: string,
    config: Partial<MorningReadConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.userProfile = this.initializeProfile(userId);
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  private initializeProfile(userId: string): UserProfile {
    return {
      id: userId,
      interests: new Map(),
      readHistory: [],
      preferredCategories: [...this.config.categories],
      preferredSources: [...this.config.sources],
      lastActive: new Date()
    };
  }

  // ========================================================================
  // Briefing Generation
  // ========================================================================

  /**
   * 生成晨读简报
   */
  async generateBriefing(
    fetchFn: (sources: string[]) => Promise<Array<{
      id: string;
      title: string;
      content: string;
      summary?: string;
      source: string;
      url: string;
      publishedAt: Date;
      category: string;
      tags: string[];
      quality: number;
    }>>,
    summarizeFn?: (text: string) => Promise<string>
  ): Promise<MorningBriefing> {
    const startTime = Date.now();
    
    if (this.isGenerating) {
      throw new Error('Briefing generation already in progress');
    }

    this.isGenerating = true;
    this.emit('briefing:started');

    try {
      // 1. 获取数据
      const rawItems = await fetchFn(this.config.sources);
      
      this.emit('briefing:fetched', { count: rawItems.length });

      // 2. 内容筛选与评分
      const scoredItems = this.scoreItems(rawItems);
      
      // 3. 个性化排序
      const personalized = this.personalizeItems(scoredItems);
      
      // 4. 多样化选择（避免同一来源/类别过多）
      const diversified = this.diversifySelection(personalized);
      
      // 5. 选择最终条目
      const selectedItems = diversified.slice(0, this.config.maxItems);

      // 6. 生成摘要（如需要）
      const briefingItems: BriefingItem[] = await Promise.all(
        selectedItems.map(async (item) => {
          const summary = item.summary || 
            (summarizeFn ? await summarizeFn(item.content) : this.generateFallbackSummary(item.content));
          
          return {
            id: item.id,
            title: item.title,
            summary,
            source: item.source,
            url: item.url,
            publishedAt: item.publishedAt,
            category: item.category,
            tags: item.tags,
            relevanceScore: item.score,
            readingTime: this.estimateReadingTime(summary)
          };
        })
      );

      // 7. 分类组织
      const sections = this.organizeSections(briefingItems);

      // 8. 生成亮点
      const highlights = this.generateHighlights(scoredItems);

      // 9. 生成推荐
      const recommended = this.generateRecommendations();

      // 10. 构建简报
      const briefing: MorningBriefing = {
        id: `briefing-${Date.now()}`,
        generatedAt: new Date(),
        readingTime: this.calculateReadingTime(briefingItems),
        sections,
        highlights: this.config.output.includeHighlights ? highlights : [],
        recommended: this.config.output.includeRecommended ? recommended : [],
        stats: this.calculateStats(briefingItems),
        metadata: {
          totalSources: this.config.sources.length,
          personalizationScore: this.calculatePersonalizationScore(briefingItems),
          processingTime: Date.now() - startTime
        }
      };

      // 11. 存储历史
      this.briefingHistory.push(briefing);
      if (this.briefingHistory.length > 30) {
        this.briefingHistory.shift();
      }

      this.emit('briefing:completed', {
        id: briefing.id,
        itemCount: briefingItems.length,
        processingTime: briefing.metadata.processingTime
      });

      return briefing;
    } catch (error) {
      this.emit('briefing:error', { error });
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  // ========================================================================
  // Scoring & Personalization
  // ========================================================================

  private scoreItems(items: Array<any>): Array<any & { score: number }> {
    return items.map(item => {
      let score = 0;

      // 质量分
      score += item.quality * 0.3;

      // 时效性
      const hoursOld = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
      if (hoursOld < 24) score += 0.3;
      else if (hoursOld < 72) score += 0.2;
      else if (hoursOld < 168) score += 0.1;

      // 互动数据（如有）
      if (item.engagement) {
        score += Math.min(item.engagement.likes / 1000, 0.2);
        score += Math.min(item.engagement.comments / 500, 0.1);
      }

      // 标题吸引力
      if (/^(重磅|独家|首发|深度)/.test(item.title)) score += 0.05;

      return { ...item, score };
    });
  }

  private personalizeItems(
    items: Array<any & { score: number }>
  ): Array<any & { score: number }> {
    if (!this.config.personalization.enabled) {
      return items.sort((a, b) => b.score - a.score);
    }

    return items.map(item => {
      let personalizedScore = item.score;

      // 基于兴趣匹配
      for (const [interest, weight] of this.userProfile.interests) {
        if (item.title.toLowerCase().includes(interest.toLowerCase()) ||
            item.tags.some((t: string) => t.toLowerCase() === interest.toLowerCase())) {
          personalizedScore += weight * 0.2;
        }
      }

      // 基于历史阅读
      const similarRead = this.userProfile.readHistory.some(
        h => h.itemId === item.id || h.liked
      );
      if (similarRead) personalizedScore += 0.1;

      // 偏好分类
      if (this.userProfile.preferredCategories.includes(item.category)) {
        personalizedScore += 0.15;
      }

      // 偏好来源
      if (this.userProfile.preferredSources.includes(item.source)) {
        personalizedScore += 0.05;
      }

      return { ...item, score: personalizedScore };
    }).sort((a, b) => b.score - a.score);
  }

  private diversifySelection(
    items: Array<any & { score: number }>
  ): Array<any & { score: number }> {
    const selected: Array<any & { score: number }> = [];
    const sourceCount: Record<string, number> = {};
    const categoryCount: Record<string, number> = {};

    const maxPerSource = Math.ceil(this.config.maxItems * 0.4);
    const maxPerCategory = Math.ceil(this.config.maxItems * 0.5);

    for (const item of items) {
      const source = item.source;
      const category = item.category;

      sourceCount[source] = (sourceCount[source] || 0) + 1;
      categoryCount[category] = (categoryCount[category] || 0) + 1;

      // 多样性控制
      if (sourceCount[source] > maxPerSource && Math.random() > 0.3) continue;
      if (categoryCount[category] > maxPerCategory && Math.random() > 0.3) continue;

      selected.push(item);

      if (selected.length >= this.config.maxItems) break;
    }

    return selected;
  }

  // ========================================================================
  // Section Organization
  // ========================================================================

  private organizeSections(items: BriefingItem[]): BriefingSection[] {
    const sections: BriefingSection[] = [];

    // 按分类分组
    const byCategory: Record<string, BriefingItem[]> = {};
    for (const item of items) {
      const cat = item.category || '其他';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }

    // 创建分类section
    const categoryIcons: Record<string, string> = {
      'AI/ML': '🤖',
      '编程': '💻',
      '前端': '🎨',
      '后端': '⚙️',
      'DevOps': '🚀',
      '开源': '🌟',
      '安全': '🔒',
      '产品': '📱'
    };

    for (const [category, catItems] of Object.entries(byCategory)) {
      if (catItems.length > 0) {
        sections.push({
          title: `${categoryIcons[category] || '📄'} ${category}`,
          items: catItems.slice(0, 5)
        });
      }
    }

    // 按优先级排序section
    const categoryPriority = ['AI/ML', '编程', '开源', 'DevOps'];
    sections.sort((a, b) => {
      const aPriority = categoryPriority.findIndex(c => a.title.includes(c));
      const bPriority = categoryPriority.findIndex(c => b.title.includes(c));
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    });

    return sections;
  }

  // ========================================================================
  // Highlights & Recommendations
  // ========================================================================

  private generateHighlights(items: Array<any>): HighlightItem[] {
    const highlights: HighlightItem[] = [];

    // 找出热度最高的
    const trending = items
      .filter(i => i.engagement && i.engagement.views > 10000)
      .sort((a, b) => (b.engagement?.views || 0) - (a.engagement?.views || 0))
      .slice(0, 2);

    for (const item of trending) {
      highlights.push({
        id: item.id,
        title: item.title,
        reason: `🔥 ${item.engagement.views.toLocaleString()} 阅读`,
        type: 'trending',
        source: item.source,
        url: item.url
      });
    }

    // 最新内容
    const latest = items
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 1);

    if (latest[0] && !highlights.find(h => h.id === latest[0].id)) {
      highlights.push({
        id: latest[0].id,
        title: latest[0].title,
        reason: '⏰ 最新发布',
        type: 'breaking',
        source: latest[0].source,
        url: latest[0].url
      });
    }

    return highlights.slice(0, 3);
  }

  private generateRecommendations(): RecommendedItem[] {
    const recommendations: RecommendedItem[] = [];

    // 基于兴趣生成推荐
    const topInterests = Array.from(this.userProfile.interests.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [interest, weight] of topInterests) {
      recommendations.push({
        id: `rec-${interest}`,
        title: `${interest} 相关资讯`,
        reason: `基于您的阅读偏好`,
        confidence: weight,
        basedOn: [interest]
      });
    }

    return recommendations;
  }

  // ========================================================================
  // Formatting
  // ========================================================================

  formatBriefing(briefing: MorningBriefing): string {
    switch (this.config.output.format) {
      case 'html':
        return this.formatAsHTML(briefing);
      case 'json':
        return JSON.stringify(briefing, null, 2);
      case 'markdown':
      default:
        return this.formatAsMarkdown(briefing);
    }
  }

  private formatAsMarkdown(briefing: MorningBriefing): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ☀️ Alice晨读 - ${briefing.generatedAt.toLocaleDateString('zh-CN')}`);
    lines.push('');

    // 问候
    lines.push(`> 早安！今天为您精选了 ${briefing.stats.totalItems} 条科技资讯，`);
    lines.push(`> 预计阅读时间：${briefing.readingTime} 分钟`);
    lines.push('');

    // 亮点
    if (briefing.highlights.length > 0) {
      lines.push('## 🌟 今日亮点');
      lines.push('');
      for (const h of briefing.highlights) {
        lines.push(`**${h.title}**`);
        lines.push(`${h.reason} | [${h.source}](${h.url})`);
        lines.push('');
      }
    }

    // 各分类
    for (const section of briefing.sections) {
      lines.push(`## ${section.title}`);
      lines.push('');
      
      for (const item of section.items) {
        lines.push(`### ${item.title}`);
        lines.push('');
        lines.push(item.summary);
        lines.push('');
        lines.push(`[阅读原文](${item.url}) · ${item.source} · ${item.publishedAt.toLocaleDateString('zh-CN')}`);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    // 推荐
    if (briefing.recommended.length > 0) {
      lines.push('## 💡 为您推荐');
      lines.push('');
      for (const r of briefing.recommended) {
        lines.push(`- **${r.title}** - ${r.reason}`);
      }
      lines.push('');
    }

    // 统计
    lines.push('---');
    lines.push('');
    lines.push(`*生成时间: ${briefing.generatedAt.toLocaleString('zh-CN')}*`);
    lines.push(`*个性化匹配度: ${Math.round(briefing.metadata.personalizationScore * 100)}%*`);

    return lines.join('\n');
  }

  private formatAsHTML(briefing: MorningBriefing): string {
    // 简化版HTML输出
    const markdown = this.formatAsMarkdown(briefing);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Alice晨读 - ${briefing.generatedAt.toLocaleDateString('zh-CN')}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    blockquote { color: #666; border-left: 3px solid #ddd; padding-left: 15px; }
  </style>
</head>
<body>
  ${markdown.replace(/\n/g, '<br>')}
</body>
</html>`;
  }

  // ========================================================================
  // Scheduling
  // ========================================================================

  startScheduledGeneration(
    fetchFn: () => Promise<any[]>,
    summarizeFn?: (text: string) => Promise<string>
  ): CronJob {
    // 解析cron表达式（简化版，只支持基本的 * 和数字）
    const schedule = this.parseCron(this.config.schedule);
    
    const calculateNextRun = (): Date => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(schedule.hour, schedule.minute, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next;
    };

    const scheduleNext = () => {
      const next = calculateNextRun();
      const delay = next.getTime() - Date.now();
      
      const timeout = setTimeout(async () => {
        try {
          await this.generateBriefing(fetchFn, summarizeFn);
        } catch (error) {
          this.emit('scheduled:error', { error });
        }
        scheduleNext();
      }, delay);

      return { stop: () => clearTimeout(timeout), nextRun: () => next };
    };

    this.currentJob = scheduleNext();
    
    this.emit('scheduled:started', { nextRun: calculateNextRun() });

    return {
      stop: () => this.currentJob?.stop(),
      nextRun: () => calculateNextRun()
    };
  }

  stopScheduledGeneration(): void {
    if (this.currentJob) {
      this.currentJob.stop();
      this.currentJob = undefined;
      this.emit('scheduled:stopped');
    }
  }

  private parseCron(cron: string): { minute: number; hour: number } {
    const parts = cron.split(' ');
    return {
      minute: parts[0] === '*' ? 0 : parseInt(parts[0]),
      hour: parts[1] === '*' ? 8 : parseInt(parts[1])
    };
  }

  // ========================================================================
  // User Profile Management
  // ========================================================================

  recordRead(itemId: string, dwellTime: number, liked: boolean): void {
    this.userProfile.readHistory.push({
      itemId,
      timestamp: new Date(),
      dwellTime,
      liked
    });

    // 更新兴趣权重
    if (liked) {
      // 简化：从itemId提取关键词作为兴趣
      // 实际应从item内容提取
      const keywords = ['AI', '编程', '开源'];
      for (const kw of keywords) {
        const current = this.userProfile.interests.get(kw) || 0;
        this.userProfile.interests.set(kw, Math.min(current + 0.1, 1));
      }
    }

    // 兴趣衰减
    this.applyInterestDecay();
    
    this.userProfile.lastActive = new Date();
  }

  private applyInterestDecay(): void {
    const decay = this.config.personalization.interestDecay;
    for (const [interest, weight] of this.userProfile.interests) {
      this.userProfile.interests.set(interest, weight * decay);
    }
  }

  updatePreferences(categories?: string[], sources?: string[]): void {
    if (categories) {
      this.userProfile.preferredCategories = categories;
    }
    if (sources) {
      this.userProfile.preferredSources = sources;
    }
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private generateFallbackSummary(content: string): string {
    // 简单的提取式摘要
    const sentences = content.split(/[。！？.!?]/).filter(s => s.trim());
    return sentences.slice(0, 2).join('。') + '...';
  }

  private estimateReadingTime(text: string): number {
    const chars = text.length;
    // 中文阅读速度约300字/分钟
    return Math.ceil(chars / 300 * 60);
  }

  private calculateReadingTime(items: BriefingItem[]): number {
    const totalSeconds = items.reduce((sum, i) => sum + (i.readingTime || 30), 0);
    return Math.ceil(totalSeconds / 60);
  }

  private calculateStats(items: BriefingItem[]): BriefingStats {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let totalQuality = 0;

    for (const item of items) {
      bySource[item.source] = (bySource[item.source] || 0) + 1;
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      totalQuality += item.relevanceScore;
    }

    return {
      totalItems: items.length,
      bySource,
      byCategory,
      avgQuality: items.length > 0 ? totalQuality / items.length : 0
    };
  }

  private calculatePersonalizationScore(items: BriefingItem[]): number {
    if (!this.config.personalization.enabled) return 0;
    
    const matched = items.filter(item => 
      this.userProfile.preferredCategories.includes(item.category) ||
      item.tags.some(t => this.userProfile.interests.has(t))
    ).length;

    return items.length > 0 ? matched / items.length : 0;
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getHistory(): MorningBriefing[] {
    return [...this.briefingHistory];
  }

  getUserProfile(): UserProfile {
    return { ...this.userProfile };
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createMorningRead(
  userId: string,
  config?: Partial<MorningReadConfig>
): MorningRead {
  return new MorningRead(userId, config);
}

export default MorningRead;
