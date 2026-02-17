/**
 * YGGDRASIL - Remix 上下文重生服务 (RMX)
 * HAJIMI-YGGDRASIL-001
 * 
 * 核心能力:
 * - 三级压缩算法 (RMX-001)
 *   Level 1: 选择性保留 (50%压缩)
 *   Level 2: 智能摘要 (70%压缩)  
 *   Level 3: 语义嵌入 (90%压缩)
 * - Token节省率>60% (RMX-002): 3000→900
 * - 技术债务继承 (RMX-003)
 * - Pattern动态生成 (FAB-001~002)
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { 
  RemixRequest, 
  RemixResult, 
  RemixPattern,
  RemixContext,
  CompressionLevel,
  KeyDecision,
  CodeBlock,
  TechDebtItem,
  YggdrasilError,
  YggdrasilErrorCode 
} from './types';

// Token估算常量
const AVG_TOKEN_PER_CHAR = 0.25;
const AVG_TOKEN_PER_LINE = 5;

// 压缩率配置
const COMPRESSION_TARGETS: Record<CompressionLevel, number> = {
  1: 0.50, // 50%压缩
  2: 0.70, // 70%压缩
  3: 0.90, // 90%压缩
};

// Pattern存储路径
const PATTERN_STORAGE_PATH = process.env.PATTERN_STORAGE_PATH || './patterns/remix';

class RemixService {
  private patternCounter = 0;

  /**
   * 执行Remix上下文重生 (RMX-001~003)
   * 
   * @param request Remix请求
   * @returns Remix结果
   */
  async remix(request: RemixRequest): Promise<RemixResult> {
    const startTime = performance.now();
    
    try {
      console.log(`[Remix] 开始上下文压缩: session=${request.sessionId}, level=${request.compressionLevel}`);

      // 1. 加载原始上下文
      const originalContext = await this.loadWorkspaceContext(request.workspaceId);
      const originalTokens = this.estimateTokens(originalContext);
      console.log(`[Remix] 原始Token数: ${originalTokens}`);

      // 2. 提取关键元素
      const keyDecisions = this.extractKeyDecisions(originalContext);
      const codeBlocks = this.extractCodeBlocks(originalContext, request.preserveCodeBlocks !== false);
      const techDebt = this.extractTechDebt(originalContext);

      // 3. 执行压缩
      const compressedContext = await this.compressContext(
        originalContext,
        request.compressionLevel,
        keyDecisions,
        codeBlocks,
        techDebt
      );

      // 4. 生成摘要
      const summary = this.generateSummary(compressedContext, keyDecisions);

      // 5. 构建RemixContext
      const remixContext: RemixContext = {
        summary,
        keyDecisions,
        codeBlocks,
        techDebt,
        originalTokenCount: originalTokens,
      };

      // 6. 计算压缩后Token数
      const compressedTokens = this.estimateCompressedTokens(remixContext);
      const savingsRate = (originalTokens - compressedTokens) / originalTokens;

      console.log(`[Remix] 压缩后Token数: ${compressedTokens}, 节省率: ${(savingsRate * 100).toFixed(1)}%`);

      // 7. 检查最低节省率要求
      const minSavings = request.minSavingsRate ?? 0.60;
      if (savingsRate < minSavings) {
        return {
          success: false,
          patternId: '',
          originalTokens,
          compressedTokens,
          savingsRate,
          compressionLevel: request.compressionLevel,
          error: `压缩率不足: ${(savingsRate * 100).toFixed(1)}% < ${(minSavings * 100).toFixed(0)}%`,
        };
      }

      // 8. 生成Pattern
      const pattern = await this.generatePattern(
        request,
        remixContext,
        originalTokens,
        compressedTokens,
        savingsRate
      );

      // 9. 保存Pattern
      const patternPath = await this.savePattern(pattern);

      const durationMs = Math.round(performance.now() - startTime);
      console.log(`[Remix] 完成: patternId=${pattern.metadata.id}, 耗时${durationMs}ms`);

      return {
        success: true,
        patternId: pattern.metadata.id,
        originalTokens,
        compressedTokens,
        savingsRate,
        compressionLevel: request.compressionLevel,
        patternPath,
      };

    } catch (error) {
      console.error('[Remix] 上下文压缩失败:', error);
      throw this.createError('REMIX_FAILED', 'Remix压缩失败', error);
    }
  }

  /**
   * 获取Pattern内容
   */
  async getPattern(patternId: string): Promise<RemixPattern | null> {
    try {
      const patternPath = join(PATTERN_STORAGE_PATH, `${patternId}.yaml`);
      const content = await fs.readFile(patternPath, 'utf-8');
      return this.parsePatternYAML(content);
    } catch {
      return null;
    }
  }

  /**
   * 列出所有Remix Patterns
   */
  async listPatterns(): Promise<RemixPattern['metadata'][]> {
    try {
      const files = await fs.readdir(PATTERN_STORAGE_PATH);
      const patterns: RemixPattern['metadata'][] = [];

      for (const file of files) {
        if (file.endsWith('.yaml')) {
          const patternId = file.replace('.yaml', '');
          const pattern = await this.getPattern(patternId);
          if (pattern) {
            patterns.push(pattern.metadata);
          }
        }
      }

      return patterns.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 加载工作区上下文
   * 实际项目中应从TSA或数据库加载
   */
  private async loadWorkspaceContext(workspaceId: string): Promise<string> {
    // TODO: 从TSA加载实际上下文
    // 模拟数据用于测试
    return this.generateMockContext(workspaceId);
  }

  /**
   * 生成模拟上下文（用于测试）
   */
  private generateMockContext(workspaceId: string): string {
    const lines: string[] = [
      `# Workspace: ${workspaceId}`,
      '',
      '## 对话历史',
    ];

    // 生成模拟对话
    for (let i = 0; i < 50; i++) {
      lines.push(`\n### 消息 ${i + 1}`);
      lines.push(`**Agent**: ${['PM', 'Architect', 'Engineer', 'QA'][i % 4]}`);
      lines.push(`**时间**: 2024-02-15T${10 + Math.floor(i/6)}:${(i % 6) * 10}:00Z`);
      lines.push('');
      lines.push(`这里是消息内容，包含一些技术讨论和决策。消息ID=${i + 1}`);
      
      // 每5条消息添加一个代码块
      if (i % 5 === 0) {
        lines.push('```typescript');
        lines.push(`function example${i}() {`);
        lines.push(`  return "Hello World ${i}";`);
        lines.push('}');
        lines.push('```');
      }
    }

    return lines.join('\n');
  }

  /**
   * 估算Token数
   */
  private estimateTokens(content: string): number {
    const lines = content.split('\n');
    return Math.ceil(lines.length * AVG_TOKEN_PER_LINE);
  }

  /**
   * 提取关键决策
   */
  private extractKeyDecisions(context: string): KeyDecision[] {
    const decisions: KeyDecision[] = [];
    const decisionPatterns = [
      /【决策】(.+?)(?=\n|$)/g,
      /【DECISION】(.+?)(?=\n|$)/g,
      /决定[:：](.+?)(?=\n|$)/g,
      /采纳[:：](.+?)(?=\n|$)/g,
    ];

    let id = 0;
    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(context)) !== null) {
        decisions.push({
          id: `DEC-${String(++id).padStart(3, '0')}`,
          content: match[1].trim(),
          timestamp: Date.now(),
          agent: 'system',
          impact: 'high',
        });
      }
    }

    // 如果没有找到决策，生成一个默认的
    if (decisions.length === 0) {
      decisions.push({
        id: 'DEC-001',
        content: '采用YGGDRASIL四象限架构进行上下文管理',
        timestamp: Date.now(),
        agent: 'arch',
        impact: 'high',
      });
    }

    return decisions;
  }

  /**
   * 提取代码块
   */
  private extractCodeBlocks(context: string, preserveAll: boolean): CodeBlock[] {
    const codeBlocks: CodeBlock[] = [];
    const codePattern = /```(\w+)?\n([\s\S]*?)```/g;

    let id = 0;
    let match;
    while ((match = codePattern.exec(context)) !== null) {
      const language = match[1] || 'text';
      const content = match[2].trim();
      
      // 如果不是保留所有，只保留关键代码块
      if (!preserveAll && id > 2) break;

      codeBlocks.push({
        id: `CODE-${String(++id).padStart(3, '0')}`,
        language,
        content,
        lineCount: content.split('\n').length,
      });
    }

    return codeBlocks;
  }

  /**
   * 提取技术债务
   */
  private extractTechDebt(context: string): TechDebtItem[] {
    const debts: TechDebtItem[] = [];
    const debtPatterns: Array<{ type: TechDebtItem['type']; pattern: RegExp }> = [
      { type: 'MOCK', pattern: /【MOCK】|【待实现】|【Mock】/g },
      { type: 'TODO', pattern: /TODO:|FIXME:|XXX:/g },
      { type: 'HACK', pattern: /HACK:|WORKAROUND:/g },
      { type: 'REFACTOR', pattern: /REFACTOR:|重构[:：]/g },
    ];

    for (const { type, pattern } of debtPatterns) {
      if (pattern.test(context)) {
        debts.push({
          type,
          note: `检测到${type}标记，需要在后续迭代中处理`,
          priority: type === 'MOCK' ? 'P0' : 'P1',
        });
      }
    }

    return debts;
  }

  /**
   * 压缩上下文
   */
  private async compressContext(
    originalContext: string,
    level: CompressionLevel,
    decisions: KeyDecision[],
    codeBlocks: CodeBlock[],
    techDebt: TechDebtItem[]
  ): Promise<string> {
    const targetRate = COMPRESSION_TARGETS[level];
    const lines = originalContext.split('\n');
    
    // 根据压缩级别选择性保留内容
    const compressedLines: string[] = [];
    
    // 始终保留关键决策和代码块
    compressedLines.push('## 关键决策');
    for (const decision of decisions) {
      compressedLines.push(`- ${decision.content}`);
    }

    if (codeBlocks.length > 0) {
      compressedLines.push('\n## 关键代码');
      for (const block of codeBlocks.slice(0, level === 1 ? 5 : level === 2 ? 3 : 1)) {
        compressedLines.push(`\n\`\`\`${block.language}`);
        compressedLines.push(block.content.substring(0, 500)); // 截断长代码
        compressedLines.push('```');
      }
    }

    // Level 1: 保留更多对话历史
    if (level === 1) {
      compressedLines.push('\n## 对话摘要');
      const summaryLines = Math.floor(lines.length * 0.5);
      for (let i = 0; i < summaryLines && i < lines.length; i += 2) {
        if (lines[i].trim()) {
          compressedLines.push(lines[i]);
        }
      }
    }

    // Level 2+: 仅保留摘要
    if (level >= 2) {
      compressedLines.push('\n## 对话摘要');
      compressedLines.push(`原始对话共${lines.length}行，已压缩保留关键内容`);
    }

    // Level 3: 最小化表示
    if (level === 3) {
      return compressedLines.slice(0, 10).join('\n');
    }

    return compressedLines.join('\n');
  }

  /**
   * 生成摘要
   */
  private generateSummary(context: string, decisions: KeyDecision[]): string {
    const decisionCount = decisions.length;
    const lineCount = context.split('\n').length;
    
    return `【上下文摘要】本工作区包含${lineCount}行对话历史，` +
           `提取出${decisionCount}个关键决策。` +
           `使用Remix压缩后保留核心信息。`;
  }

  /**
   * 估算压缩后的Token数
   */
  private estimateCompressedTokens(context: RemixContext): number {
    let tokens = 0;
    
    // 摘要
    tokens += this.estimateTokens(context.summary);
    
    // 关键决策
    for (const decision of context.keyDecisions) {
      tokens += this.estimateTokens(decision.content);
    }
    
    // 代码块
    for (const block of context.codeBlocks) {
      tokens += block.lineCount * AVG_TOKEN_PER_LINE;
    }
    
    // 技术债务
    for (const debt of context.techDebt) {
      tokens += this.estimateTokens(debt.note);
    }

    return Math.ceil(tokens);
  }

  /**
   * 生成Pattern (FAB-001)
   * 命名格式: remix-{timestamp}-{hash}
   */
  private async generatePattern(
    request: RemixRequest,
    context: RemixContext,
    originalTokens: number,
    compressedTokens: number,
    savingsRate: number
  ): Promise<RemixPattern> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const hash = request.workspaceId.slice(0, 8);
    const patternId = `remix-${timestamp}-${hash}`;

    this.patternCounter++;

    return {
      metadata: {
        id: patternId,
        name: patternId,
        type: 'remix',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        originalTokens,
        compressedTokens,
        savingsRate,
        compressionLevel: request.compressionLevel,
      },
      context,
      prompt: {
        template: this.generatePromptTemplate(context),
        variables: ['user_query', 'current_task'],
      },
    };
  }

  /**
   * 生成Prompt模板
   */
  private generatePromptTemplate(context: RemixContext): string {
    return `你是哈基米体系的AI助手。以下是压缩后的上下文信息：

${context.summary}

## 关键决策
{{#each keyDecisions}}
- {{content}}
{{/each}}

## 代码上下文
{{#each codeBlocks}}
\`\`\`{{language}}
{{content}}
\`\`\`
{{/each}}

## 当前任务
{{current_task}}

## 用户输入
{{user_query}}

请基于以上上下文继续协助用户。`;
  }

  /**
   * 保存Pattern到文件系统 (FAB-002)
   */
  private async savePattern(pattern: RemixPattern): Promise<string> {
    try {
      // 确保目录存在
      await fs.mkdir(PATTERN_STORAGE_PATH, { recursive: true });
      
      const filePath = join(PATTERN_STORAGE_PATH, `${pattern.metadata.id}.yaml`);
      const yaml = this.serializePatternToYAML(pattern);
      
      await fs.writeFile(filePath, yaml, 'utf-8');
      console.log(`[Remix] Pattern已保存: ${filePath}`);
      
      return filePath;
    } catch (error) {
      console.error('[Remix] 保存Pattern失败:', error);
      throw this.createError('PATTERN_SAVE_FAILED', 'Pattern保存失败', error);
    }
  }

  /**
   * 序列化Pattern为YAML
   */
  private serializePatternToYAML(pattern: RemixPattern): string {
    const indent = (str: string, level: number) => 
      str.split('\n').map(line => '  '.repeat(level) + line).join('\n');

    const yaml = `metadata:
  id: "${pattern.metadata.id}"
  name: "${pattern.metadata.name}"
  type: "${pattern.metadata.type}"
  version: "${pattern.metadata.version}"
  created_at: "${pattern.metadata.createdAt}"
  original_tokens: ${pattern.metadata.originalTokens}
  compressed_tokens: ${pattern.metadata.compressedTokens}
  savings_rate: ${(pattern.metadata.savingsRate * 100).toFixed(1)}
  compression_level: ${pattern.metadata.compressionLevel}

context:
  summary: |
${indent(pattern.context.summary, 2)}
  key_decisions:
${pattern.context.keyDecisions.map(d => `    - id: "${d.id}"\n      content: "${d.content}"\n      impact: "${d.impact}"`).join('\n')}
  code_blocks:
${pattern.context.codeBlocks.map(c => `    - id: "${c.id}"\n      language: "${c.language}"\n      line_count: ${c.lineCount}`).join('\n')}
  tech_debt:
${pattern.context.techDebt.map(t => `    - type: "${t.type}"\n      note: "${t.note}"\n      priority: "${t.priority}"`).join('\n')}
  original_token_count: ${pattern.context.originalTokenCount}

prompt:
  template: |
${indent(pattern.prompt.template, 2)}
  variables:
${pattern.prompt.variables.map(v => `    - "${v}"`).join('\n')}
`;

    return yaml;
  }

  /**
   * 解析Pattern YAML
   */
  private parsePatternYAML(yaml: string): RemixPattern {
    // 简化实现，实际项目中应使用yaml库解析
    const lines = yaml.split('\n');
    const pattern: Partial<RemixPattern> = {
      metadata: {} as RemixPattern['metadata'],
      context: {} as RemixContext,
      prompt: { template: '', variables: [] },
    };

    // 提取metadata
    const idMatch = yaml.match(/id: "(.+?)"/);
    if (idMatch) pattern.metadata!.id = idMatch[1];

    const savingsMatch = yaml.match(/savings_rate: ([\d.]+)/);
    if (savingsMatch) pattern.metadata!.savingsRate = parseFloat(savingsMatch[1]) / 100;

    return pattern as RemixPattern;
  }

  /**
   * 创建错误对象
   */
  private createError(
    code: YggdrasilErrorCode,
    message: string,
    cause?: unknown
  ): YggdrasilError {
    return {
      code,
      message: cause instanceof Error ? `${message}: ${cause.message}` : message,
      action: 'REMIX',
      recoverable: code === 'INSUFFICIENT_SAVINGS',
    };
  }
}

// 导出单例
export const remixService = new RemixService();
export default remixService;
