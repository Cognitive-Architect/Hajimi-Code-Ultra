/**
 * Hajimi Claw - Bilibili Source Adapter
 * B站技术区爬虫与视频信息提取
 * @version 1.0.0
 * @implements CLAW-001 (日抓取量>100篇)
 * @debt B站反爬策略变化（P1，需Playwright自适应）
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface BilibiliVideo {
  bvid: string;
  title: string;
  description: string;
  url: string;
  cover: string;
  duration: string;
  author: {
    name: string;
    mid: number;
    avatar?: string;
  };
  stats: {
    views: number;
    likes: number;
    coins: number;
    favorites: number;
    shares: number;
    comments: number;
    danmaku: number;
  };
  tags: string[];
  category: {
    tid: number;
    name: string;
    parentName: string;
  };
  publishedAt: string;
  techScore?: number; // 技术内容评分
}

export interface BilibiliFetchOptions {
  category?: 'tech' | 'cs' | 'ai' | 'programming' | 'all';
  order?: 'hot' | 'new' | 'score';
  page?: number;
  pageSize?: number;
  dateRange?: 'day' | 'week' | 'month';
  keyword?: string;
}

export interface AntiCrawlConfig {
  usePlaywright: boolean;
  headless: boolean;
  proxy?: string;
  userAgentRotation: boolean;
  requestInterval: [number, number]; // [min, max] ms
  retryAttempts: number;
  captchaHandler?: 'manual' | 'service';
}

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// ============================================================================
// Configuration
// ============================================================================

const BILI_API_BASE = 'https://api.bilibili.com';
const BILI_WWW_BASE = 'https://www.bilibili.com';

// 技术区分类映射
const TECH_CATEGORIES: Record<string, { tid: number; name: string }> = {
  tech: { tid: 188, name: '科技' },
  cs: { tid: 95, name: '计算机技术' },
  ai: { tid: 208, name: '人工智能' },
  programming: { tid: 230, name: '编程' }
};

// 用户代理池
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

// ============================================================================
// Bilibili Source Adapter
// ============================================================================

export class BilibiliSource extends EventEmitter {
  private config: AntiCrawlConfig;
  private requestCount = 0;
  private lastRequestTime = 0;
  private playwrightAvailable = false;

  constructor(config: Partial<AntiCrawlConfig> = {}) {
    super();
    this.config = {
      usePlaywright: config.usePlaywright ?? false,
      headless: config.headless ?? true,
      proxy: config.proxy,
      userAgentRotation: config.userAgentRotation ?? true,
      requestInterval: config.requestInterval ?? [1000, 3000],
      retryAttempts: config.retryAttempts ?? 3,
      captchaHandler: config.captchaHandler ?? 'manual'
    };
  }

  // ========================================================================
  // Anti-Crawl Utilities
  // ========================================================================

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private async randomDelay(): Promise<void> {
    const [min, max] = this.config.requestInterval;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.bilibili.com',
      'Origin': 'https://www.bilibili.com',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    };

    if (this.config.userAgentRotation) {
      headers['User-Agent'] = this.getRandomUserAgent();
    }

    return headers;
  }

  private async checkPlaywright(): Promise<boolean> {
    try {
      // 动态导入Playwright，避免在API模式下强制依赖
      const pw = await import('playwright');
      this.playwrightAvailable = true;
      return true;
    } catch {
      this.playwrightAvailable = false;
      return false;
    }
  }

  // ========================================================================
  // API Methods (Primary)
  // ========================================================================

  async fetchTechVideos(options: BilibiliFetchOptions = {}): Promise<BilibiliVideo[]> {
    const {
      category = 'tech',
      order = 'hot',
      page = 1,
      pageSize = 20,
      dateRange = 'week',
      keyword
    } = options;

    this.emit('fetch:started', { source: 'bilibili', options });

    try {
      let videos: BilibiliVideo[] = [];

      if (keyword) {
        videos = await this.searchVideos(keyword, page, pageSize, order);
      } else {
        videos = await this.fetchByCategory(category, page, pageSize, order, dateRange);
      }

      // 过滤技术相关内容
      videos = videos.filter(v => this.isTechContent(v));

      // 计算技术评分
      videos.forEach(v => {
        v.techScore = this.calculateTechScore(v);
      });

      // 按技术评分排序
      videos.sort((a, b) => (b.techScore || 0) - (a.techScore || 0));

      this.emit('fetch:completed', { source: 'bilibili', count: videos.length });
      
      return videos;
    } catch (error) {
      this.emit('fetch:error', { source: 'bilibili', error });
      
      // API失败时尝试Playwright降级
      if (this.config.usePlaywright && await this.checkPlaywright()) {
        this.emit('fallback:playwright', { reason: error });
        return this.fetchWithPlaywright(options);
      }
      
      throw error;
    }
  }

  private async fetchByCategory(
    category: string,
    page: number,
    pageSize: number,
    order: string,
    dateRange: string
  ): Promise<BilibiliVideo[]> {
    const catInfo = TECH_CATEGORIES[category] || TECH_CATEGORIES.tech;
    
    // 转换排序参数
    const orderMap: Record<string, string> = {
      hot: 'click',
      new: 'pubdate',
      score: 'stow'
    };

    const params = new URLSearchParams({
      search_type: 'video',
      view_type: 'hot_rank',
      cate_id: catInfo.tid.toString(),
      page: page.toString(),
      pagesize: pageSize.toString(),
      time_from: this.getDateRangeStart(dateRange),
      time_to: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      order: orderMap[order] || 'click'
    });

    await this.randomDelay();

    const response = await fetch(
      `${BILI_API_BASE}/x/web-interface/search/type?${params}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: ApiResponse<any> = await response.json();

    if (result.code !== 0) {
      // 检测反爬
      if (result.code === -412 || result.message?.includes('风控')) {
        throw new Error(`Anti-crawl triggered: ${result.message}`);
      }
      throw new Error(`API Error: ${result.message}`);
    }

    return (result.data?.result || []).map((item: any) => this.parseVideoItem(item));
  }

  private async searchVideos(
    keyword: string,
    page: number,
    pageSize: number,
    order: string
  ): Promise<BilibiliVideo[]> {
    const params = new URLSearchParams({
      keyword: encodeURIComponent(keyword),
      search_type: 'video',
      page: page.toString(),
      pagesize: pageSize.toString(),
      order: order === 'hot' ? 'click' : order === 'new' ? 'pubdate' : 'stow'
    });

    await this.randomDelay();

    const response = await fetch(
      `${BILI_API_BASE}/x/web-interface/search/all?${params}`,
      { headers: this.getHeaders() }
    );

    const result: ApiResponse<any> = await response.json();

    if (result.code !== 0) {
      throw new Error(`Search failed: ${result.message}`);
    }

    const videos = result.data?.result?.find((r: any) => r.result_type === 'video');
    return (videos?.data || []).map((item: any) => this.parseVideoItem(item));
  }

  // ========================================================================
  // Playwright Fallback (Dynamic Rendering)
  // ========================================================================

  async fetchWithPlaywright(options: BilibiliFetchOptions = {}): Promise<BilibiliVideo[]> {
    if (!await this.checkPlaywright()) {
      throw new Error('Playwright not available');
    }

    this.emit('playwright:started', { options });

    try {
      const { chromium } = await import('playwright');
      
      const browser = await chromium.launch({
        headless: this.config.headless,
        proxy: this.config.proxy ? { server: this.config.proxy } : undefined
      });

      const context = await browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: 'zh-CN'
      });

      const page = await context.newPage();

      // 设置额外HTTP头
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9'
      });

      // 拦截并记录API响应
      const videos: BilibiliVideo[] = [];
      
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/x/web-interface/search') || url.includes('/x/web-interface/ranking')) {
          try {
            const data = await response.json();
            if (data.code === 0 && data.data) {
              const items = data.data.result || data.data.list || [];
              items.forEach((item: any) => {
                videos.push(this.parseVideoItem(item));
              });
            }
          } catch {
            // 忽略非JSON响应
          }
        }
      });

      // 导航到目标页面
      const category = options.category || 'tech';
      const catInfo = TECH_CATEGORIES[category];
      const url = `${BILI_WWW_BASE}/v/tech/${catInfo?.tid || 188}`;
      
      await page.goto(url, { waitUntil: 'networkidle' });
      
      // 等待内容加载
      await page.waitForSelector('.video-list-item, .rank-item', { timeout: 10000 });
      
      // 滚动加载更多
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(2000);
      }

      // 尝试从DOM提取
      const domVideos = await page.evaluate(() => {
        const items = document.querySelectorAll('.video-list-item, .rank-item, .video-card');
        return Array.from(items).map(item => ({
          bvid: item.getAttribute('data-bvid') || '',
          title: item.querySelector('.title, .info a')?.textContent?.trim() || '',
          url: item.querySelector('a')?.href || ''
        }));
      });

      await browser.close();

      this.emit('playwright:completed', { count: videos.length });

      // 合并API和DOM数据，去重
      const allVideos = [...videos];
      const seen = new Set(videos.map(v => v.bvid));
      
      for (const v of domVideos) {
        if (v.bvid && !seen.has(v.bvid)) {
          seen.add(v.bvid);
          // 简化对象，后续通过API补全
          allVideos.push({
            bvid: v.bvid,
            title: v.title,
            description: '',
            url: v.url,
            cover: '',
            duration: '',
            author: { name: '', mid: 0 },
            stats: { views: 0, likes: 0, coins: 0, favorites: 0, shares: 0, comments: 0, danmaku: 0 },
            tags: [],
            category: { tid: 0, name: '', parentName: '' },
            publishedAt: ''
          });
        }
      }

      return allVideos;
    } catch (error) {
      this.emit('playwright:error', { error });
      throw error;
    }
  }

  // ========================================================================
  // Video Details
  // ========================================================================

  async fetchVideoDetails(bvid: string): Promise<Partial<BilibiliVideo>> {
    await this.randomDelay();

    const response = await fetch(
      `${BILI_API_BASE}/x/web-interface/view?bvid=${bvid}`,
      { headers: this.getHeaders() }
    );

    const result: ApiResponse<any> = await response.json();

    if (result.code !== 0) {
      throw new Error(`Failed to fetch video details: ${result.message}`);
    }

    const data = result.data;
    
    return {
      bvid: data.bvid,
      title: data.title,
      description: data.desc,
      url: `https://www.bilibili.com/video/${data.bvid}`,
      cover: data.pic,
      duration: this.formatDuration(data.duration),
      author: {
        name: data.owner.name,
        mid: data.owner.mid,
        avatar: data.owner.face
      },
      stats: {
        views: data.stat.view,
        likes: data.stat.like,
        coins: data.stat.coin,
        favorites: data.stat.favorite,
        shares: data.stat.share,
        comments: data.stat.reply,
        danmaku: data.stat.danmaku
      },
      tags: data.dynamic ? data.dynamic.split('#').filter(Boolean) : [],
      category: {
        tid: data.tid,
        name: data.tname,
        parentName: ''
      },
      publishedAt: new Date(data.pubdate * 1000).toISOString()
    };
  }

  // ========================================================================
  // Content Analysis
  // ========================================================================

  private isTechContent(video: BilibiliVideo): boolean {
    const techKeywords = [
      '编程', '代码', '开发', '程序员', '软件', '算法', '数据结构',
      '前端', '后端', '全栈', 'web', 'app', 'python', 'java', 'javascript',
      'typescript', 'go', 'rust', 'cpp', 'c++', 'ai', '人工智能', '机器学习',
      '深度学习', '神经网络', '大模型', 'llm', 'chatgpt', '开源', 'github',
      'docker', 'kubernetes', 'linux', '数据库', 'redis', 'mysql', 'mongodb',
      'vue', 'react', 'angular', 'nodejs', 'spring', 'django', 'flask',
      '教程', '实战', '项目', '架构', '设计模式', '面试', '技术分享'
    ];

    const text = `${video.title} ${video.description} ${video.tags?.join(' ') || ''}`.toLowerCase();
    
    return techKeywords.some(kw => text.includes(kw.toLowerCase()));
  }

  private calculateTechScore(video: BilibiliVideo): number {
    let score = 0;
    
    // 标题技术关键词权重
    const techKeywords = ['教程', '实战', '开源', '代码', '项目', '架构', '设计模式'];
    techKeywords.forEach(kw => {
      if (video.title.includes(kw)) score += 5;
    });

    // 互动数据权重
    score += Math.min(video.stats.views / 1000, 20);
    score += video.stats.likes / 100;
    score += video.stats.coins * 2;
    score += video.stats.favorites;

    // 评论区活跃度
    score += Math.min(video.stats.comments / 10, 10);

    // 标签数量
    score += (video.tags?.length || 0) * 2;

    // 时效性
    const daysSince = (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) score += 10;
    else if (daysSince < 30) score += 5;

    return Math.round(score);
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private parseVideoItem(item: any): BilibiliVideo {
    return {
      bvid: item.bvid || item.id,
      title: item.title?.replace(/<[^>]+>/g, '') || '',
      description: item.description || item.desc || '',
      url: item.arcurl || `https://www.bilibili.com/video/${item.bvid}`,
      cover: item.pic || item.cover || '',
      duration: item.duration || '',
      author: {
        name: item.author || item.owner?.name || '',
        mid: item.mid || item.owner?.mid || 0,
        avatar: item.face || item.owner?.face || ''
      },
      stats: {
        views: item.play || item.stat?.view || 0,
        likes: item.like || item.stat?.like || 0,
        coins: item.coins || item.stat?.coin || 0,
        favorites: item.favorites || item.stat?.favorite || 0,
        shares: item.share || item.stat?.share || 0,
        comments: item.review || item.stat?.reply || 0,
        danmaku: item.video_review || item.stat?.danmaku || 0
      },
      tags: item.tag?.split(',') || [],
      category: {
        tid: item.tid || item.typeid || 0,
        name: item.typename || item.tname || '',
        parentName: ''
      },
      publishedAt: item.pubdate 
        ? new Date(item.pubdate * 1000).toISOString()
        : item.senddate 
          ? new Date(item.senddate * 1000).toISOString()
          : new Date().toISOString()
    };
  }

  private getDateRangeStart(range: string): string {
    const now = new Date();
    switch (range) {
      case 'day':
        now.setDate(now.getDate() - 1);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
    }
    return now.toISOString().split('T')[0].replace(/-/g, '');
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ========================================================================
  // Batch Operations
  // ========================================================================

  async batchFetchDetails(bvids: string[]): Promise<BilibiliVideo[]> {
    this.emit('batch:started', { count: bvids.length });
    
    const results: BilibiliVideo[] = [];
    const errors: { bvid: string; error: any }[] = [];

    for (const bvid of bvids) {
      try {
        const details = await this.fetchVideoDetails(bvid);
        if (details.bvid) {
          results.push(details as BilibiliVideo);
        }
        
        this.emit('batch:progress', {
          completed: results.length,
          total: bvids.length
        });
      } catch (error) {
        errors.push({ bvid, error });
      }
    }

    this.emit('batch:completed', {
      success: results.length,
      failed: errors.length
    });

    return results;
  }

  // ========================================================================
  // Health Check
  // ========================================================================

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      const response = await fetch(`${BILI_API_BASE}/x/web-interface/zone`, {
        headers: this.getHeaders()
      });
      
      if (response.ok) {
        return { healthy: true, message: 'API accessible' };
      }
      
      return { healthy: false, message: `HTTP ${response.status}` };
    } catch (error: any) {
      return { healthy: false, message: error.message };
    }
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createBilibiliSource(config?: Partial<AntiCrawlConfig>): BilibiliSource {
  return new BilibiliSource(config);
}

export default BilibiliSource;
