/**
 * Hajimi Claw - GitHub Source Adapter
 * GitHub Trending抓取与API调用
 * @version 1.0.0
 * @implements CLAW-001 (日抓取量>100篇)
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  trendingRank?: number;
}

export interface GitHubTrendingItem {
  title: string;
  description: string;
  url: string;
  stars: string;
  forks: string;
  language: string;
  starsToday: string;
  trendingPeriod: 'daily' | 'weekly' | 'monthly';
}

export interface GitHubFetchOptions {
  language?: string;
  spokenLanguage?: string;
  period?: 'daily' | 'weekly' | 'monthly';
  maxRepos?: number;
  useApi?: boolean;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetTime: Date;
  used: number;
}

export interface GitHubToken {
  token: string;
  usage: number;
  lastUsed: Date;
  rateLimitRemaining: number;
}

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TRENDING_URL = 'https://github.com/trending';

const RATE_LIMIT_PER_HOUR = 5000;
const REQUEST_DELAY_MS = 100; // 请求间隔，避免触发限制

// ============================================================================
// GitHub Source Adapter
// ============================================================================

export class GitHubSource extends EventEmitter {
  private tokens: GitHubToken[] = [];
  private currentTokenIndex = 0;
  private rateLimitStatus: Map<string, RateLimitStatus> = new Map();
  private lastRequestTime = 0;

  constructor(tokens?: string[]) {
    super();
    if (tokens && tokens.length > 0) {
      this.tokens = tokens.map(t => ({
        token: t,
        usage: 0,
        lastUsed: new Date(),
        rateLimitRemaining: RATE_LIMIT_PER_HOUR
      }));
    }
  }

  // ========================================================================
  // Token Management
  // ========================================================================

  addToken(token: string): void {
    this.tokens.push({
      token,
      usage: 0,
      lastUsed: new Date(),
      rateLimitRemaining: RATE_LIMIT_PER_HOUR
    });
    this.emit('token:added', { tokenCount: this.tokens.length });
  }

  private getCurrentToken(): GitHubToken | null {
    if (this.tokens.length === 0) return null;
    return this.tokens[this.currentTokenIndex];
  }

  private rotateToken(): GitHubToken | null {
    if (this.tokens.length === 0) return null;
    
    // 寻找使用率最低的token
    let minUsage = Infinity;
    let selectedIndex = 0;
    
    this.tokens.forEach((t, i) => {
      if (t.rateLimitRemaining > 100 && t.usage < minUsage) {
        minUsage = t.usage;
        selectedIndex = i;
      }
    });
    
    this.currentTokenIndex = selectedIndex;
    const token = this.tokens[selectedIndex];
    
    this.emit('token:rotated', { 
      index: selectedIndex, 
      remaining: token.rateLimitRemaining 
    });
    
    return token;
  }

  // ========================================================================
  // Rate Limit Handling
  // ========================================================================

  private async checkRateLimit(token?: string): Promise<RateLimitStatus> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Hajimi-Claw/1.0'
    };
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    try {
      const response = await fetch(`${GITHUB_API_BASE}/rate_limit`, { headers });
      const data = await response.json();
      
      const status: RateLimitStatus = {
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        resetTime: new Date(data.rate.reset * 1000),
        used: data.rate.used
      };
      
      this.rateLimitStatus.set(token || 'anonymous', status);
      return status;
    } catch (error) {
      this.emit('error', { type: 'rate_limit_check', error });
      throw error;
    }
  }

  private async waitForRateLimitReset(resetTime: Date): Promise<void> {
    const now = Date.now();
    const resetMs = resetTime.getTime();
    const waitMs = Math.max(resetMs - now + 1000, 0);
    
    this.emit('rate_limit:waiting', { waitMs, resetTime });
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  private async enforceRequestDelay(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise(resolve => 
        setTimeout(resolve, REQUEST_DELAY_MS - elapsed)
      );
    }
    
    this.lastRequestTime = Date.now();
  }

  // ========================================================================
  // Trending Scraping (Web)
  // ========================================================================

  async fetchTrending(options: GitHubFetchOptions = {}): Promise<GitHubTrendingItem[]> {
    const { 
      language = '', 
      period = 'daily',
      maxRepos = 25 
    } = options;

    this.emit('fetch:started', { source: 'github-trending', options });

    try {
      // 构建URL
      let url = GITHUB_TRENDING_URL;
      if (language) {
        url += `/${encodeURIComponent(language)}`;
      }
      url += `?since=${period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly'}`;

      await this.enforceRequestDelay();

      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const items = this.parseTrendingHTML(html, period, maxRepos);

      this.emit('fetch:completed', { 
        source: 'github-trending', 
        count: items.length 
      });

      return items;
    } catch (error) {
      this.emit('fetch:error', { source: 'github-trending', error });
      throw error;
    }
  }

  private parseTrendingHTML(
    html: string, 
    period: string, 
    maxRepos: number
  ): GitHubTrendingItem[] {
    const items: GitHubTrendingItem[] = [];
    
    // 简化的HTML解析 - 使用正则匹配
    const articleRegex = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    const titleRegex = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/;
    const descRegex = /<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/;
    const starsRegex = /<a[^>]*href="[^"]*stargazers[^"]*"[^>]*>([\s\S]*?)<\/a>/;
    const langRegex = /<span[^>]*itemprop="programmingLanguage"[^>]*>([^<]+)<\/span>/;
    const starsTodayRegex = /<span[^>]*class="[^"]*d-inline-block[^"]*"[^>]*>(\d+)\s*stars?\s*today<\/span>/i;

    let match;
    let count = 0;

    while ((match = articleRegex.exec(html)) !== null && count < maxRepos) {
      const articleHtml = match[1];
      
      const titleMatch = titleRegex.exec(articleHtml);
      const descMatch = descRegex.exec(articleHtml);
      const starsMatch = starsRegex.exec(articleHtml);
      const langMatch = langRegex.exec(articleHtml);
      const starsTodayMatch = starsTodayRegex.exec(articleHtml);

      if (titleMatch) {
        const urlPath = titleMatch[1].trim();
        const title = this.cleanHTML(titleMatch[2]);
        const description = descMatch ? this.cleanHTML(descMatch[1]) : '';
        const stars = starsMatch ? this.cleanHTML(starsMatch[1]) : '0';
        const language = langMatch ? langMatch[1].trim() : 'Unknown';
        const starsToday = starsTodayMatch ? starsTodayMatch[1] : '0';

        items.push({
          title,
          description,
          url: `https://github.com${urlPath}`,
          stars,
          forks: '', // Trending页面可能不显示forks
          language,
          starsToday,
          trendingPeriod: period as 'daily' | 'weekly' | 'monthly'
        });

        count++;
      }
    }

    return items;
  }

  private cleanHTML(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // ========================================================================
  // API Methods
  // ========================================================================

  async fetchRepoDetails(owner: string, repo: string): Promise<GitHubRepo> {
    const token = this.getCurrentToken();
    
    if (token) {
      await this.checkRateLimit(token.token);
      
      if (token.rateLimitRemaining < 10) {
        this.rotateToken();
      }
    }

    await this.enforceRequestDelay();

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Hajimi-Claw/1.0'
    };

    if (token) {
      headers['Authorization'] = `token ${token.token}`;
    }

    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
        { headers }
      );

      if (response.status === 403) {
        const resetHeader = response.headers.get('X-RateLimit-Reset');
        if (resetHeader) {
          const resetTime = new Date(parseInt(resetHeader) * 1000);
          this.emit('rate_limit:hit', { resetTime });
          
          // 尝试切换token
          const newToken = this.rotateToken();
          if (newToken && newToken.rateLimitRemaining > 10) {
            return this.fetchRepoDetails(owner, repo);
          }
          
          await this.waitForRateLimitReset(resetTime);
          return this.fetchRepoDetails(owner, repo);
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (token) {
        token.usage++;
        const remaining = response.headers.get('X-RateLimit-Remaining');
        if (remaining) {
          token.rateLimitRemaining = parseInt(remaining);
        }
      }

      return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        url: data.html_url,
        stars: data.stargazers_count,
        forks: data.forks_count,
        language: data.language,
        topics: data.topics || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error) {
      this.emit('error', { type: 'api_fetch', owner, repo, error });
      throw error;
    }
  }

  async searchRepos(query: string, perPage = 30): Promise<GitHubRepo[]> {
    const token = this.getCurrentToken();
    await this.enforceRequestDelay();

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Hajimi-Claw/1.0'
    };

    if (token) {
      headers['Authorization'] = `token ${token.token}`;
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    
    return data.items.map((item: any) => ({
      id: item.id,
      name: item.name,
      fullName: item.full_name,
      description: item.description,
      url: item.html_url,
      stars: item.stargazers_count,
      forks: item.forks_count,
      language: item.language,
      topics: item.topics || [],
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  }

  // ========================================================================
  // Batch Operations
  // ========================================================================

  async batchFetchRepos(repoUrls: string[]): Promise<GitHubRepo[]> {
    this.emit('batch:started', { count: repoUrls.length });
    
    const results: GitHubRepo[] = [];
    const errors: { url: string; error: any }[] = [];

    for (const url of repoUrls) {
      try {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (match) {
          const repo = await this.fetchRepoDetails(match[1], match[2]);
          results.push(repo);
          
          // 触发进度事件
          this.emit('batch:progress', { 
            completed: results.length, 
            total: repoUrls.length 
          });
        }
      } catch (error) {
        errors.push({ url, error });
      }
    }

    this.emit('batch:completed', { 
      success: results.length, 
      failed: errors.length 
    });

    return results;
  }

  // ========================================================================
  // Statistics & Health
  // ========================================================================

  getStats(): {
    tokenCount: number;
    totalUsage: number;
    rateLimits: Map<string, RateLimitStatus>;
  } {
    return {
      tokenCount: this.tokens.length,
      totalUsage: this.tokens.reduce((sum, t) => sum + t.usage, 0),
      rateLimits: this.rateLimitStatus
    };
  }

  isHealthy(): boolean {
    if (this.tokens.length === 0) return true; // 无token时仍可用trending
    
    return this.tokens.some(t => t.rateLimitRemaining > 50);
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createGitHubSource(tokens?: string[]): GitHubSource {
  return new GitHubSource(tokens);
}

export default GitHubSource;
