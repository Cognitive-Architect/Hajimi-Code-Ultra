/**
 * B-08 Patterns Context测试 - State Context Pattern
 * 
 * 覆盖率目标: Patterns Context≥70%
 * @cov COV-003
 */

import { StateContextPattern } from '@/patterns/context/state-context';
import { PatternType, ContextType } from '@/patterns/types';

describe('StateContextPattern (COV-003)', () => {
  /**
   * 测试: Pattern基本结构完整
   */
  it('should have complete pattern structure', () => {
    expect(StateContextPattern).toBeDefined();
    expect(StateContextPattern.meta).toBeDefined();
    expect(StateContextPattern.type).toBe(PatternType.CONTEXT);
    expect(StateContextPattern.contextType).toBe(ContextType.STATE);
  });

  /**
   * 测试: 元数据正确
   */
  it('should have correct metadata', () => {
    const { meta } = StateContextPattern;
    
    expect(meta.id).toBe('ctx:state');
    expect(meta.name).toBe('State Context');
    expect(meta.description).toContain('状态');
    expect(meta.author).toBe('Fabric Team');
    expect(meta.tags).toContain('context');
    expect(meta.tags).toContain('state');
    expect(meta.tags).toContain('runtime');
    expect(meta.version).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  /**
   * 测试: 模板内容正确
   */
  it('should have correct template content', () => {
    const { content } = StateContextPattern;
    
    expect(content).toContain('# CTX:STATE');
    expect(content).toContain('{{systemMode}}');
    expect(content).toContain('{{version}}');
    expect(content).toContain('{{uptime}}');
    expect(content).toContain('{{cpuUsage}}');
    expect(content).toContain('{{memoryUsage}}');
    expect(content).toContain('{{tokenCount}}');
    expect(content).toContain('{{featureFlags}}');
    expect(content).toContain('{{errorCount}}');
    expect(content).toContain('{{lastError}}');
    expect(content).toContain('{{recoveryStatus}}');
  });

  /**
   * 测试: 变量定义完整
   */
  it('should have complete variable definitions', () => {
    const { variables } = StateContextPattern;
    
    expect(variables).toHaveLength(10);
    
    // 系统信息变量
    const systemModeVar = variables.find(v => v.name === 'systemMode');
    expect(systemModeVar).toBeDefined();
    expect(systemModeVar?.type).toBe('string');
    expect(systemModeVar?.defaultValue).toBe('normal');
    
    const versionVar = variables.find(v => v.name === 'version');
    expect(versionVar).toBeDefined();
    expect(versionVar?.type).toBe('string');
    
    const uptimeVar = variables.find(v => v.name === 'uptime');
    expect(uptimeVar).toBeDefined();
    expect(uptimeVar?.type).toBe('string');
    
    // 性能指标变量
    const cpuUsageVar = variables.find(v => v.name === 'cpuUsage');
    expect(cpuUsageVar).toBeDefined();
    expect(cpuUsageVar?.type).toBe('number');
    expect(cpuUsageVar?.defaultValue).toBe(0);
    
    const memoryUsageVar = variables.find(v => v.name === 'memoryUsage');
    expect(memoryUsageVar).toBeDefined();
    expect(memoryUsageVar?.type).toBe('number');
    expect(memoryUsageVar?.defaultValue).toBe(0);
    
    const tokenCountVar = variables.find(v => v.name === 'tokenCount');
    expect(tokenCountVar).toBeDefined();
    expect(tokenCountVar?.type).toBe('number');
    expect(tokenCountVar?.defaultValue).toBe(0);
    
    // 功能标志变量
    const featureFlagsVar = variables.find(v => v.name === 'featureFlags');
    expect(featureFlagsVar).toBeDefined();
    expect(featureFlagsVar?.type).toBe('object');
    expect(featureFlagsVar?.defaultValue).toEqual({});
    
    // 错误状态变量
    const errorCountVar = variables.find(v => v.name === 'errorCount');
    expect(errorCountVar).toBeDefined();
    expect(errorCountVar?.type).toBe('number');
    expect(errorCountVar?.defaultValue).toBe(0);
    
    const lastErrorVar = variables.find(v => v.name === 'lastError');
    expect(lastErrorVar).toBeDefined();
    expect(lastErrorVar?.type).toBe('string');
    
    const recoveryStatusVar = variables.find(v => v.name === 'recoveryStatus');
    expect(recoveryStatusVar).toBeDefined();
    expect(recoveryStatusVar?.type).toBe('string');
    expect(recoveryStatusVar?.defaultValue).toBe('ok');
  });

  /**
   * 测试: 片段定义完整
   */
  it('should have fragments defined', () => {
    const { fragments } = StateContextPattern;
    
    expect(fragments).toHaveLength(1);
    expect(fragments![0].type).toBe(ContextType.STATE);
    expect(fragments![0].content).toBe('系统状态上下文');
    expect(fragments![0].priority).toBe(6);
    expect(fragments![0].ttl).toBe(60);
  });

  /**
   * 测试: Token限制
   */
  it('should have max tokens configured', () => {
    expect(StateContextPattern.maxTokens).toBe(300);
  });

  /**
   * 测试: 驱逐策略
   */
  it('should have FIFO eviction policy', () => {
    expect(StateContextPattern.evictionPolicy).toBe('fifo');
  });

  /**
   * 测试: Token优化配置
   */
  it('should have token optimization configured', () => {
    const { tokenOpt } = StateContextPattern;
    
    expect(tokenOpt).toBeDefined();
    expect(tokenOpt?.enabled).toBe(true);
    expect(tokenOpt?.compressionRatio).toBe(0.25);
  });

  /**
   * 测试: 依赖定义
   */
  it('should have no dependencies', () => {
    const { dependencies } = StateContextPattern;
    
    expect(dependencies).toEqual([]);
  });

  /**
   * 测试: 模板使用系统状态分隔符
   */
  it('should use system state section separators', () => {
    const { content } = StateContextPattern;
    
    expect(content).toContain('## SYS');
    expect(content).toContain('## PERF');
    expect(content).toContain('## FLAGS');
    expect(content).toContain('## ERR');
  });

  /**
   * 测试: SYS部分包含系统信息
   */
  it('should include system info in SYS section', () => {
    const { content } = StateContextPattern;
    
    expect(content).toContain('MODE:');
    expect(content).toContain('VER:');
    expect(content).toContain('UPTIME:');
  });

  /**
   * 测试: PERF部分包含性能指标
   */
  it('should include performance metrics in PERF section', () => {
    const { content } = StateContextPattern;
    
    expect(content).toContain('CPU:');
    expect(content).toContain('MEM:');
    expect(content).toContain('TOKENS:');
  });

  /**
   * 测试: 系统模式默认值
   */
  it('should default system mode to normal', () => {
    const modeVar = StateContextPattern.variables.find(v => v.name === 'systemMode');
    expect(modeVar?.defaultValue).toBe('normal');
  });

  /**
   * 测试: 恢复状态默认值
   */
  it('should default recovery status to ok', () => {
    const recoveryVar = StateContextPattern.variables.find(v => v.name === 'recoveryStatus');
    expect(recoveryVar?.defaultValue).toBe('ok');
  });

  /**
   * 测试: 性能指标默认值
   */
  it('should default performance metrics to 0', () => {
    const cpuVar = StateContextPattern.variables.find(v => v.name === 'cpuUsage');
    const memVar = StateContextPattern.variables.find(v => v.name === 'memoryUsage');
    const tokenVar = StateContextPattern.variables.find(v => v.name === 'tokenCount');
    
    expect(cpuVar?.defaultValue).toBe(0);
    expect(memVar?.defaultValue).toBe(0);
    expect(tokenVar?.defaultValue).toBe(0);
  });

  /**
   * 测试: TTL设置（状态上下文需要频繁更新）
   */
  it('should have short TTL for state context', () => {
    const { fragments } = StateContextPattern;
    
    // 状态上下文TTL应该较短（1分钟）
    expect(fragments![0].ttl).toBe(60);
  });

  /**
   * 测试: 优先级设置（状态上下文优先级较低）
   */
  it('should have lower priority for state context', () => {
    const { fragments } = StateContextPattern;
    
    // 状态上下文优先级应该较低
    expect(fragments![0].priority).toBe(6);
  });

  /**
   * 测试: MaxTokens设置（状态上下文应该较小）
   */
  it('should have smaller max tokens for state context', () => {
    // 状态上下文应该有较小的token限制
    expect(StateContextPattern.maxTokens).toBe(300);
  });

  /**
   * 测试: 变量类型分布
   */
  it('should have appropriate variable types', () => {
    const { variables } = StateContextPattern;
    
    const stringVars = variables.filter(v => v.type === 'string');
    const numberVars = variables.filter(v => v.type === 'number');
    const objectVars = variables.filter(v => v.type === 'object');
    
    expect(stringVars.length).toBe(5);
    expect(numberVars.length).toBe(4);
    expect(objectVars.length).toBe(1);
  });

  /**
   * 测试: 上下文类型正确
   */
  it('should be STATE context type', () => {
    expect(StateContextPattern.contextType).toBe(ContextType.STATE);
    expect(StateContextPattern.type).toBe(PatternType.CONTEXT);
  });
});
