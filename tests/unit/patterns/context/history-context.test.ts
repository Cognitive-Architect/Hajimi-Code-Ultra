/**
 * B-08 Patterns Context测试 - History Context Pattern
 * 
 * 覆盖率目标: Patterns Context≥70%
 * @cov COV-003
 */

import { HistoryContextPattern } from '@/patterns/context/history-context';
import { PatternType, ContextType } from '@/patterns/types';

describe('HistoryContextPattern (COV-003)', () => {
  /**
   * 测试: Pattern基本结构完整
   */
  it('should have complete pattern structure', () => {
    expect(HistoryContextPattern).toBeDefined();
    expect(HistoryContextPattern.meta).toBeDefined();
    expect(HistoryContextPattern.type).toBe(PatternType.CONTEXT);
    expect(HistoryContextPattern.contextType).toBe(ContextType.HISTORY);
  });

  /**
   * 测试: 元数据正确
   */
  it('should have correct metadata', () => {
    const { meta } = HistoryContextPattern;
    
    expect(meta.id).toBe('ctx:history');
    expect(meta.name).toBe('History Context');
    expect(meta.description).toContain('历史');
    expect(meta.author).toBe('Fabric Team');
    expect(meta.tags).toContain('context');
    expect(meta.tags).toContain('history');
    expect(meta.tags).toContain('conversation');
    expect(meta.version).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  /**
   * 测试: 模板内容正确
   */
  it('should have correct template content', () => {
    const { content } = HistoryContextPattern;
    
    expect(content).toContain('# CTX:HIST');
    expect(content).toContain('{{summary}}');
    expect(content).toContain('{{lastInteraction}}');
    expect(content).toContain('{{keyPoints}}');
    expect(content).toContain('{{interactionCount}}');
    expect(content).toContain('{{sessionDuration}}');
    expect(content).toContain('{{userSatisfaction}}');
  });

  /**
   * 测试: 变量定义完整
   */
  it('should have complete variable definitions', () => {
    const { variables } = HistoryContextPattern;
    
    expect(variables).toHaveLength(7);
    
    // 检查各个变量
    const summaryVar = variables.find(v => v.name === 'summary');
    expect(summaryVar).toBeDefined();
    expect(summaryVar?.type).toBe('string');
    expect(summaryVar?.defaultValue).toBe('');
    
    const lastInteractionVar = variables.find(v => v.name === 'lastInteraction');
    expect(lastInteractionVar).toBeDefined();
    expect(lastInteractionVar?.required).toBe(false);
    
    const keyPointsVar = variables.find(v => v.name === 'keyPoints');
    expect(keyPointsVar).toBeDefined();
    expect(keyPointsVar?.type).toBe('array');
    expect(keyPointsVar?.defaultValue).toEqual([]);
    
    const interactionCountVar = variables.find(v => v.name === 'interactionCount');
    expect(interactionCountVar).toBeDefined();
    expect(interactionCountVar?.type).toBe('number');
    expect(interactionCountVar?.defaultValue).toBe(0);
    
    const sessionDurationVar = variables.find(v => v.name === 'sessionDuration');
    expect(sessionDurationVar).toBeDefined();
    expect(sessionDurationVar?.type).toBe('string');
    
    const userSatisfactionVar = variables.find(v => v.name === 'userSatisfaction');
    expect(userSatisfactionVar).toBeDefined();
    expect(userSatisfactionVar?.type).toBe('string');
    expect(userSatisfactionVar?.defaultValue).toBe('unknown');
    
    const recentMessagesVar = variables.find(v => v.name === 'recentMessages');
    expect(recentMessagesVar).toBeDefined();
    expect(recentMessagesVar?.type).toBe('array');
    expect(recentMessagesVar?.defaultValue).toEqual([]);
  });

  /**
   * 测试: 片段定义完整
   */
  it('should have fragments defined', () => {
    const { fragments } = HistoryContextPattern;
    
    expect(fragments).toHaveLength(1);
    expect(fragments![0].type).toBe(ContextType.HISTORY);
    expect(fragments![0].content).toBe('对话历史上下文');
    expect(fragments![0].priority).toBe(8);
    expect(fragments![0].ttl).toBe(1800);
  });

  /**
   * 测试: Token限制
   */
  it('should have max tokens configured', () => {
    expect(HistoryContextPattern.maxTokens).toBe(800);
  });

  /**
   * 测试: 驱逐策略
   */
  it('should have LRU eviction policy', () => {
    expect(HistoryContextPattern.evictionPolicy).toBe('lru');
  });

  /**
   * 测试: Token优化配置
   */
  it('should have token optimization configured', () => {
    const { tokenOpt } = HistoryContextPattern;
    
    expect(tokenOpt).toBeDefined();
    expect(tokenOpt?.enabled).toBe(true);
    expect(tokenOpt?.compressionRatio).toBe(0.25);
  });

  /**
   * 测试: 依赖定义（历史上下文无依赖）
   */
  it('should have no dependencies', () => {
    const { dependencies } = HistoryContextPattern;
    
    expect(dependencies).toEqual([]);
  });

  /**
   * 测试: 模板使用标准分隔符
   */
  it('should use standard section separators', () => {
    const { content } = HistoryContextPattern;
    
    expect(content).toContain('## SUMMARY');
    expect(content).toContain('## LAST');
    expect(content).toContain('## KEY');
    expect(content).toContain('## CNT');
  });

  /**
   * 测试: CNT部分包含统计信息
   */
  it('should include statistics in CNT section', () => {
    const { content } = HistoryContextPattern;
    const cntSection = content.match(/## CNT\s*\n([^#]+)/);
    
    expect(cntSection).toBeTruthy();
    expect(cntSection![1]).toContain('interactionCount');
    expect(cntSection![1]).toContain('sessionDuration');
    expect(cntSection![1]).toContain('userSatisfaction');
  });

  /**
   * 测试: 用户满意度默认值
   */
  it('should default user satisfaction to unknown', () => {
    const satisfactionVar = HistoryContextPattern.variables.find(
      v => v.name === 'userSatisfaction'
    );
    expect(satisfactionVar?.defaultValue).toBe('unknown');
  });

  /**
   * 测试: 交互计数器默认值
   */
  it('should default interaction count to 0', () => {
    const countVar = HistoryContextPattern.variables.find(
      v => v.name === 'interactionCount'
    );
    expect(countVar?.defaultValue).toBe(0);
  });

  /**
   * 测试: TTL设置合理
   */
  it('should have reasonable TTL', () => {
    const { fragments } = HistoryContextPattern;
    
    // 历史上下文TTL应该较长（30分钟）
    expect(fragments![0].ttl).toBe(1800);
  });

  /**
   * 测试: 优先级设置
   */
  it('should have appropriate priority', () => {
    const { fragments } = HistoryContextPattern;
    
    // 历史上下文优先级应该较高
    expect(fragments![0].priority).toBe(8);
  });

  /**
   * 测试: 变量描述完整
   */
  it('should have complete variable descriptions', () => {
    const { variables } = HistoryContextPattern;
    
    variables.forEach(variable => {
      expect(variable.description).toBeDefined();
      expect(variable.description!.length).toBeGreaterThan(0);
    });
  });

  /**
   * 测试: 上下文类型正确
   */
  it('should be HISTORY context type', () => {
    expect(HistoryContextPattern.contextType).toBe(ContextType.HISTORY);
    expect(HistoryContextPattern.type).toBe(PatternType.CONTEXT);
  });
});
