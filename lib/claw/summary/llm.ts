/**
 * Hajimi Claw - LLM Summarization Engine
 * LLM生成TL;DR摘要与质量评分
 * @version 1.0.0
 * @implements CLAW-003 (简报生成<60s)
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SummaryOptions {
  maxLength?: number;       // 摘要最大字数
  style?: 'tldr' | 'bullet' | 'narrative' | 'technical';
  language?: 'zh' | 'en' | 'auto';
  includeKeyPoints?: boolean;
  includeSentiment?: boolean;
  includeTags?: boolean;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  tags: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  confidence: number;       // 置信度 0-1
  quality: SummaryQuality;
  tokenUsage: TokenUsage;
  processingTime: number;   // 毫秒
}

export interface SummaryQuality {
  relevance: number;        // 相关性 0-1
  coherence: number;        // 连贯性 0-1
  conciseness: number;      // 简洁性 0-1
  informativeness: number;  // 信息量 0-1
  overall: number;          // 综合评分 0-1
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  cost: number;             // 预估成本 USD
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'openrouter' | 'local';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ContentItem {
  id: string;
  title: string;
  content: string;
  url?: string;
  source?: string;
  publishedAt?: Date;
  author?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SUMMARY_OPTIONS: Required<SummaryOptions> = {
  maxLength: 300,
  style: 'tldr',
  language: 'zh',
  includeKeyPoints: true,
  includeSentiment: false,
  includeTags: true
};

const DEFAULT_LLM_CONFIG: Partial<LLMConfig> = {
  maxTokens: 1000,
  temperature: 0.3,
  timeout: 30000
};

// 提示词模板
const PROMPT_TEMPLATES = {
  tldr: `请为以下内容生成TL;DR（太长不看）摘要：

标题：{title}
来源：{source}
内容：
{content}

要求：
1. 摘要控制在{maxLength}字以内
2. 使用{language}撰写
3. 突出核心观点和关键信息
4. 去除冗余细节
5. 保持客观中立

输出格式：
- 一句话总结
- 3-5个关键要点`,

  bullet: `请将以下内容整理成要点形式：

标题：{title}
内容：
{content}

要求：
1. 提取5-8个关键要点
2. 每个要点简洁明了
3. 使用{language}
4. 按重要性排序`,

  narrative: `请用叙述方式总结以下内容：

标题：{title}
内容：
{content}

要求：
1. 流畅的自然语言叙述
2. 控制在{maxLength}字
3. 使用{language}
4. 保留重要细节`,

  technical: `请对以下技术内容进行专业摘要：

标题：{title}
来源：{source}
内容：
{content}

要求：
1. 技术要点清晰
2. 保留关键术语
3. 说明技术价值和应用场景
4. 控制在{maxLength}字
5. 使用{language}`
};

// ============================================================================
// LLM Summarizer
// ============================================================================

export class LLMSummarizer extends EventEmitter {
  private config: LLMConfig;
  private tokenBudget: { used: number; limit: number } = { used: 0, limit: 100000 };
  private requestQueue: Array<() => Promise<void>> = [];
  private processing = false;

  constructor(config: LLMConfig) {
    super();
    this.config = { ...DEFAULT_LLM_CONFIG, ...config };
  }

  // ========================================================================
  // Core Summarization
  // ========================================================================

  async summarize(
    content: ContentItem | string,
    options: SummaryOptions = {}
  ): Promise<SummaryResult> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_SUMMARY_OPTIONS, ...options };

    this.emit('summarize:started', { contentId: typeof content === 'string' ? 'text' : content.id });

    try {
      // 准备内容
      const item = typeof content === 'string' 
        ? { id: 'text', title: 'Text Summary', content } 
        : content;

      // Token预算检查
      const estimatedTokens = this.estimateTokens(item.content);
      if (this.tokenBudget.used + estimatedTokens > this.tokenBudget.limit) {
        throw new Error('Token budget exceeded');
      }

      // 截断过长内容
      const truncatedContent = this.truncateToBudget(
        item.content, 
        this.config.maxTokens! * 3
      );

      // 构建提示词
      const prompt = this.buildPrompt(item, truncatedContent, opts);

      // 调用LLM
      const response = await this.callLLM(prompt, opts);

      // 解析结果
      const result = this.parseResponse(response, opts);
      
      // 质量评分
      result.quality = this.assessQuality(result, item);
      result.confidence = result.quality.overall;
      result.tokenUsage = response.tokenUsage;
      result.processingTime = Date.now() - startTime;

      // 更新Token预算
      this.tokenBudget.used += response.tokenUsage.total;

      this.emit('summarize:completed', {
        contentId: item.id,
        quality: result.quality.overall,
        processingTime: result.processingTime
      });

      return result;
    } catch (error) {
      this.emit('summarize:error', { error });
      throw error;
    }
  }

  async batchSummarize(
    items: ContentItem[],
    options?: SummaryOptions
  ): Promise<Map<string, SummaryResult>> {
    this.emit('batch:started', { count: items.length });

    const results = new Map<string, SummaryResult>();
    const batchSize = 5;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(item => this.summarize(item, options))
      );

      batchResults.forEach((result, index) => {
        const item = batch[index];
        if (result.status === 'fulfilled') {
          results.set(item.id, result.value);
        } else {
          this.emit('batch:item:error', { id: item.id, error: result.reason });
        }
      });

      this.emit('batch:progress', {
        completed: Math.min(i + batchSize, items.length),
        total: items.length
      });
    }

    this.emit('batch:completed', { count: results.size });
    return results;
  }

  // ========================================================================
  // Briefing Generation
  // ========================================================================

  /**
   * 生成晨读简报（多内容聚合）
   */
  async generateBriefing(
    items: Array<{ summary: string; source: string; title: string }>,
    briefingOptions: {
      maxItems?: number;
      focusAreas?: string[];
      readingTime?: number; // 预计阅读时间（分钟）
    } = {}
  ): Promise<{
    title: string;
    greeting: string;
    sections: Array<{
      title: string;
      items: string[];
    }>;
    highlights: string[];
    readingTime: number;
    generatedAt: Date;
  }> {
    const startTime = Date.now();
    const opts = {
      maxItems: 10,
      readingTime: 5,
      ...briefingOptions
    };

    this.emit('briefing:started', { itemCount: items.length });

    // 分类整理
    const categories = this.categorizeItems(items);

    // 生成简报内容
    const prompt = `请将以下科技资讯整理成一份晨读简报：

${items.slice(0, opts.maxItems).map((item, i) => 
  `${i + 1}. [${item.source}] ${item.title}\n   ${item.summary}`
).join('\n\n')}

要求：
1. 写一个吸引人的简报标题
2. 写一句问候语（如"早安，以下是今日科技资讯..."）
3. 按主题分类（AI/编程/开源/产品等）
4. 每个主题列出2-3条要点
5. 最后列出3个今日亮点
6. 预估阅读时间

输出格式为JSON：
{
  "title": "...",
  "greeting": "...",
  "sections": [{"title": "...", "items": ["..."]}],
  "highlights": ["..."],
  "readingTime": 5
}`;

    try {
      const response = await this.callLLM(prompt, { style: 'narrative', language: 'zh' });
      
      // 解析JSON响应
      let parsed;
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        // 回退到简单格式化
        parsed = this.formatBriefingFallback(items, opts);
      }

      const processingTime = Date.now() - startTime;

      this.emit('briefing:completed', { 
        processingTime,
        meetsTarget: processingTime < 60000 // CLAW-003: <60s
      });

      return {
        title: parsed?.title || '今日科技简报',
        greeting: parsed?.greeting || '早安，为您精选今日科技资讯',
        sections: parsed?.sections || categories,
        highlights: parsed?.highlights || [],
        readingTime: parsed?.readingTime || opts.readingTime,
        generatedAt: new Date()
      };
    } catch (error) {
      this.emit('briefing:error', { error });
      // 返回简化版本
      return this.formatBriefingFallback(items, opts);
    }
  }

  // ========================================================================
  // LLM Provider Interface
  // ========================================================================

  private async callLLM(
    prompt: string, 
    options: SummaryOptions
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    const startTime = Date.now();

    // 根据提供商调用不同接口
    switch (this.config.provider) {
      case 'openai':
        return this.callOpenAI(prompt, options);
      case 'anthropic':
        return this.callAnthropic(prompt, options);
      case 'openrouter':
        return this.callOpenRouter(prompt, options);
      case 'local':
        return this.callLocalLLM(prompt, options);
      default:
        // 模拟LLM响应（测试用）
        return this.mockLLMResponse(prompt);
    }
  }

  private async callOpenAI(
    prompt: string, 
    options: SummaryOptions
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    const response = await fetch(`${this.config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: 'You are a professional content summarizer.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const usage = data.usage;

    return {
      text: data.choices[0]?.message?.content || '',
      tokenUsage: {
        prompt: usage?.prompt_tokens || 0,
        completion: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0,
        cost: this.calculateCost(usage?.prompt_tokens || 0, usage?.completion_tokens || 0)
      }
    };
  }

  private async callAnthropic(
    prompt: string,
    options: SummaryOptions
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    // Anthropic API实现
    const response = await fetch(`${this.config.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      text: data.content?.[0]?.text || '',
      tokenUsage: {
        prompt: data.usage?.input_tokens || 0,
        completion: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        cost: 0 // Anthropic成本计算
      }
    };
  }

  private async callOpenRouter(
    prompt: string,
    options: SummaryOptions
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    // OpenRouter API实现
    const response = await fetch(`${this.config.baseUrl || 'https://openrouter.ai/api'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': 'https://hajimi.local',
        'X-Title': 'Hajimi Claw'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const usage = data.usage;

    return {
      text: data.choices?.[0]?.message?.content || '',
      tokenUsage: {
        prompt: usage?.prompt_tokens || 0,
        completion: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0,
        cost: usage?.total_cost || 0
      }
    };
  }

  private async callLocalLLM(
    prompt: string,
    options: SummaryOptions
  ): Promise<{ text: string; tokenUsage: TokenUsage }> {
    // 本地LLM API（如Ollama、llama.cpp）
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Local LLM error: ${response.status}`);
    }

    const data = await response.json();

    return {
      text: data.response || '',
      tokenUsage: {
        prompt: data.prompt_eval_count || 0,
        completion: data.eval_count || 0,
        total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        cost: 0
      }
    };
  }

  private mockLLMResponse(prompt: string): { text: string; tokenUsage: TokenUsage } {
    // 模拟响应（测试用）
    const mockResponses: Record<string, string> = {
      tldr: `**一句话总结**：这是一个关于技术创新的重要内容。

**关键要点**：
1. 技术突破点清晰
2. 应用场景广泛
3. 对行业有深远影响
4. 值得关注后续发展`,
      bullet: `**要点**：
• 核心技术创新
• 实际应用价值
• 市场前景广阔
• 技术实现可行
• 团队背景强大`,
      narrative: `本文深入探讨了一项重要的技术进展。通过详细分析，我们发现这项技术具有革命性意义，有望在多个领域产生深远影响。建议持续关注其后续发展。`,
      technical: `**技术摘要**：
该技术方案采用了先进的架构设计，通过优化算法实现了性能突破。主要技术亮点包括：高效的资源利用、可扩展的系统设计、以及完善的错误处理机制。适用于大规模生产环境。`
    };

    const style = prompt.includes('TL;DR') ? 'tldr' : 
                  prompt.includes('要点') ? 'bullet' :
                  prompt.includes('叙述') ? 'narrative' : 'technical';

    return {
      text: mockResponses[style] || mockResponses.tldr,
      tokenUsage: {
        prompt: this.estimateTokens(prompt),
        completion: 150,
        total: this.estimateTokens(prompt) + 150,
        cost: 0
      }
    };
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private buildPrompt(
    item: ContentItem, 
    content: string, 
    options: Required<SummaryOptions>
  ): string {
    const template = PROMPT_TEMPLATES[options.style];
    const language = options.language === 'zh' ? '中文' : 
                     options.language === 'en' ? 'English' : 
                     options.language;

    return template
      .replace('{title}', item.title)
      .replace('{source}', item.source || 'Unknown')
      .replace('{content}', content)
      .replace('{maxLength}', options.maxLength.toString())
      .replace('{language}', language);
  }

  private parseResponse(response: { text: string }, options: Required<SummaryOptions>): SummaryResult {
    const text = response.text;

    // 提取关键要点
    const keyPoints: string[] = [];
    const bulletRegex = /^[•\-\d.][\s]*(.*)$/gm;
    let match;
    while ((match = bulletRegex.exec(text)) !== null) {
      keyPoints.push(match[1].trim());
    }

    // 提取标签
    const tags = this.extractTags(text);

    // 提取摘要主体（去除要点后的内容）
    const summary = text
      .replace(/^[•\-\d.][\s]*.*$/gm, '')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .slice(0, options.maxLength * 2);

    return {
      summary,
      keyPoints: keyPoints.slice(0, 8),
      tags,
      confidence: 0.85,
      quality: {
        relevance: 0.85,
        coherence: 0.9,
        conciseness: 0.8,
        informativeness: 0.85,
        overall: 0.85
      },
      tokenUsage: { prompt: 0, completion: 0, total: 0, cost: 0 },
      processingTime: 0
    };
  }

  private extractTags(text: string): string[] {
    const techKeywords = [
      'AI', '人工智能', '机器学习', '深度学习', 'LLM', 'GPT',
      '编程', '代码', '开源', 'GitHub', '算法', '数据结构',
      '前端', '后端', '全栈', 'Web', 'App',
      'Python', 'JavaScript', 'TypeScript', 'Go', 'Rust',
      'Docker', 'Kubernetes', '云原生', 'DevOps',
      '数据库', 'Redis', 'MySQL', 'MongoDB',
      '安全', '加密', '区块链', 'Web3',
      '产品', '设计', 'UX', '用户增长'
    ];

    return techKeywords.filter(kw => 
      text.toLowerCase().includes(kw.toLowerCase())
    ).slice(0, 5);
  }

  private assessQuality(result: SummaryResult, original: ContentItem): SummaryQuality {
    // 简单的质量评估
    const relevance = result.tags.length > 0 ? 0.85 : 0.6;
    const coherence = result.summary.length > 50 ? 0.9 : 0.7;
    const conciseness = result.summary.length < result.summary.length * 2 ? 0.85 : 0.7;
    const informativeness = result.keyPoints.length >= 3 ? 0.85 : 0.6;

    return {
      relevance,
      coherence,
      conciseness,
      informativeness,
      overall: (relevance + coherence + conciseness + informativeness) / 4
    };
  }

  private categorizeItems(
    items: Array<{ summary: string; source: string; title: string }>
  ): Array<{ title: string; items: string[] }> {
    const categories: Record<string, string[]> = {
      'AI & 机器学习': [],
      '编程开发': [],
      '开源项目': [],
      '产品技术': [],
      '其他': []
    };

    for (const item of items) {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      
      if (/\b(ai|机器学习|深度学习|llm|gpt|模型|训练)\b/.test(text)) {
        categories['AI & 机器学习'].push(`[${item.source}] ${item.title}`);
      } else if (/\b(编程|代码|开发|前端|后端|框架|库)\b/.test(text)) {
        categories['编程开发'].push(`[${item.source}] ${item.title}`);
      } else if (/\b(github|开源|仓库|贡献)\b/.test(text)) {
        categories['开源项目'].push(`[${item.source}] ${item.title}`);
      } else if (/\b(产品|设计|ux|用户体验|增长)\b/.test(text)) {
        categories['产品技术'].push(`[${item.source}] ${item.title}`);
      } else {
        categories['其他'].push(`[${item.source}] ${item.title}`);
      }
    }

    return Object.entries(categories)
      .filter(([_, items]) => items.length > 0)
      .map(([title, items]) => ({ title, items }));
  }

  private formatBriefingFallback(
    items: Array<{ summary: string; source: string; title: string }>,
    opts: { maxItems: number; readingTime: number }
  ) {
    const sections = this.categorizeItems(items.slice(0, opts.maxItems));
    
    return {
      title: '今日科技简报',
      greeting: '早安，为您精选今日科技资讯',
      sections,
      highlights: items.slice(0, 3).map(i => i.title),
      readingTime: opts.readingTime,
      generatedAt: new Date()
    };
  }

  private estimateTokens(text: string): number {
    // 简单估算：中文1字符≈1token，英文1单词≈1.3token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text.split(/\s+/).length;
    return Math.ceil(chineseChars + englishWords * 1.3);
  }

  private truncateToBudget(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '...';
  }

  private calculateCost(promptTokens: number, completionTokens: number): number {
    // OpenAI GPT-4价格估算
    const promptCost = (promptTokens / 1000) * 0.03;
    const completionCost = (completionTokens / 1000) * 0.06;
    return Math.round((promptCost + completionCost) * 10000) / 10000;
  }

  // ========================================================================
  // Token Budget Management
  // ========================================================================

  setTokenBudget(limit: number): void {
    this.tokenBudget.limit = limit;
    this.tokenBudget.used = 0;
  }

  getTokenBudget(): { used: number; limit: number; remaining: number } {
    return {
      used: this.tokenBudget.used,
      limit: this.tokenBudget.limit,
      remaining: this.tokenBudget.limit - this.tokenBudget.used
    };
  }

  resetTokenBudget(): void {
    this.tokenBudget.used = 0;
  }
}

// ============================================================================
// Factory & Export
// ============================================================================

export function createLLMSummarizer(config: LLMConfig): LLMSummarizer {
  return new LLMSummarizer(config);
}

export default LLMSummarizer;
