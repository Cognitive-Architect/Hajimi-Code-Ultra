/**
 * B-08 Patterns Action测试 - Review Action Pattern
 * 
 * 覆盖率目标: Patterns Action≥70%
 * @cov COV-002
 */

import { ReviewActionPattern } from '@/patterns/action/review.action';
import { PatternType, ActionType } from '@/patterns/types';

describe('ReviewActionPattern (COV-002)', () => {
  /**
   * 测试: Pattern基本结构完整
   */
  it('should have complete pattern structure', () => {
    expect(ReviewActionPattern).toBeDefined();
    expect(ReviewActionPattern.meta).toBeDefined();
    expect(ReviewActionPattern.type).toBe(PatternType.ACTION);
    expect(ReviewActionPattern.actionType).toBe(ActionType.REVIEW);
  });

  /**
   * 测试: 元数据正确
   */
  it('should have correct metadata', () => {
    const { meta } = ReviewActionPattern;
    
    expect(meta.id).toBe('act:review');
    expect(meta.name).toBe('Review Action');
    expect(meta.description).toContain('审查');
    expect(meta.author).toBe('Fabric Team');
    expect(meta.tags).toContain('action');
    expect(meta.tags).toContain('review');
    expect(meta.tags).toContain('quality');
    expect(meta.version).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  /**
   * 测试: 模板内容正确
   */
  it('should have correct template content', () => {
    const { content } = ReviewActionPattern;
    
    expect(content).toContain('# ACT:REVIEW');
    expect(content).toContain('{{target}}');
    expect(content).toContain('{{reviewType}}');
    expect(content).toContain('{{standards}}');
  });

  /**
   * 测试: 变量定义完整
   */
  it('should have complete variable definitions', () => {
    const { variables } = ReviewActionPattern;
    
    expect(variables).toHaveLength(4);
    
    // 检查必需变量
    const targetVar = variables.find(v => v.name === 'target');
    expect(targetVar).toBeDefined();
    expect(targetVar?.required).toBe(true);
    expect(targetVar?.type).toBe('string');
    
    // 检查可选变量
    const reviewTypeVar = variables.find(v => v.name === 'reviewType');
    expect(reviewTypeVar).toBeDefined();
    expect(reviewTypeVar?.required).toBe(false);
    expect(reviewTypeVar?.defaultValue).toBe('general');
    
    const standardsVar = variables.find(v => v.name === 'standards');
    expect(standardsVar).toBeDefined();
    expect(standardsVar?.type).toBe('array');
    expect(standardsVar?.defaultValue).toEqual([]);
    
    const focusAreasVar = variables.find(v => v.name === 'focusAreas');
    expect(focusAreasVar).toBeDefined();
    expect(focusAreasVar?.type).toBe('array');
    expect(focusAreasVar?.defaultValue).toEqual([]);
  });

  /**
   * 测试: 步骤定义完整
   */
  it('should have complete step definitions', () => {
    const { steps } = ReviewActionPattern;
    
    expect(steps).toHaveLength(4);
    
    // 步骤1: 概览扫描
    expect(steps[0].id).toBe('review-1');
    expect(steps[0].name).toBe('概览扫描');
    
    // 步骤2: 详细审查
    expect(steps[1].id).toBe('review-2');
    expect(steps[1].name).toBe('详细审查');
    expect(steps[1].validation).toBe('必须记录所有发现的问题');
    
    // 步骤3: 标准对照
    expect(steps[2].id).toBe('review-3');
    expect(steps[2].name).toBe('标准对照');
    
    // 步骤4: 总结反馈
    expect(steps[3].id).toBe('review-4');
    expect(steps[3].name).toBe('总结反馈');
    expect(steps[3].validation).toBe('必须提供可执行的修改建议');
  });

  /**
   * 测试: 前置条件定义
   */
  it('should have preconditions defined', () => {
    const { preconditions } = ReviewActionPattern;
    
    expect(preconditions).toHaveLength(2);
    expect(preconditions).toContain('审查目标已明确');
    expect(preconditions).toContain('审查标准已加载');
  });

  /**
   * 测试: 后置条件定义
   */
  it('should have postconditions defined', () => {
    const { postconditions } = ReviewActionPattern;
    
    expect(postconditions).toHaveLength(2);
    expect(postconditions).toContain('审查报告已产出');
    expect(postconditions).toContain('问题清单已记录');
  });

  /**
   * 测试: 超时设置
   */
  it('should have timeout configured', () => {
    expect(ReviewActionPattern.timeout).toBe(180000);
  });

  /**
   * 测试: Token优化配置
   */
  it('should have token optimization configured', () => {
    const { tokenOpt } = ReviewActionPattern;
    
    expect(tokenOpt).toBeDefined();
    expect(tokenOpt?.enabled).toBe(true);
    expect(tokenOpt?.compressionRatio).toBe(0.25);
  });

  /**
   * 测试: 依赖定义
   */
  it('should have dependencies defined', () => {
    const { dependencies } = ReviewActionPattern;
    
    expect(dependencies).toContain('ctx:task');
  });

  /**
   * 测试: 审查类型默认值
   */
  it('should default review type to general', () => {
    const reviewTypeVar = ReviewActionPattern.variables.find(v => v.name === 'reviewType');
    expect(reviewTypeVar?.defaultValue).toBe('general');
  });

  /**
   * 测试: 审查步骤包含质量相关提示
   */
  it('should have quality-specific prompts', () => {
    const { steps } = ReviewActionPattern;
    
    const detailStep = steps.find(s => s.id === 'review-2');
    expect(detailStep?.prompt).toContain('逻辑正确性');
    expect(detailStep?.prompt).toContain('安全问题');
    
    const summaryStep = steps.find(s => s.id === 'review-4');
    expect(summaryStep?.prompt).toContain('问题分类');
    expect(summaryStep?.prompt).toContain('优先级');
  });

  /**
   * 测试: 重点关注区域变量
   */
  it('should support focus areas variable', () => {
    const focusAreasVar = ReviewActionPattern.variables.find(v => v.name === 'focusAreas');
    expect(focusAreasVar).toBeDefined();
    expect(focusAreasVar?.type).toBe('array');
    expect(focusAreasVar?.description).toContain('重点关注');
  });

  /**
   * 测试: 审查标准变量
   */
  it('should support standards variable', () => {
    const standardsVar = ReviewActionPattern.variables.find(v => v.name === 'standards');
    expect(standardsVar).toBeDefined();
    expect(standardsVar?.description).toContain('审查标准');
  });

  /**
   * 测试: 模板使用审查专用分隔符
   */
  it('should use review-specific section separators', () => {
    const { content } = ReviewActionPattern;
    
    expect(content).toContain('## TARGET');
    expect(content).toContain('## TYPE');
    expect(content).toContain('## STD');
  });

  /**
   * 测试: 审查步骤验证规则
   */
  it('should have validation for review steps', () => {
    const { steps } = ReviewActionPattern;
    
    const detailStep = steps.find(s => s.id === 'review-2');
    expect(detailStep?.validation).toContain('记录');
    expect(detailStep?.validation).toContain('问题');
    
    const summaryStep = steps.find(s => s.id === 'review-4');
    expect(summaryStep?.validation).toContain('修改建议');
  });

  /**
   * 测试: 三个Action Pattern超时对比
   */
  it('should have appropriate timeout for review', () => {
    // 审查的超时应该介于分析和实现之间
    expect(ReviewActionPattern.timeout).toBeGreaterThan(120000);
    expect(ReviewActionPattern.timeout).toBeLessThan(300000);
  });

  /**
   * 测试: 步骤ID命名规范
   */
  it('should follow step ID naming convention', () => {
    const { steps } = ReviewActionPattern;
    
    steps.forEach(step => {
      expect(step.id).toMatch(/^review-\d+$/);
    });
  });

  /**
   * 测试: 标签包含质量相关标签
   */
  it('should have quality-related tags', () => {
    const { meta } = ReviewActionPattern;
    
    expect(meta.tags).toContain('quality');
    expect(meta.tags).toContain('review');
  });
});
