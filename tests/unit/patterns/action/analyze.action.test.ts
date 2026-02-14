/**
 * B-08 Patterns Action测试 - Analyze Action Pattern
 * 
 * 覆盖率目标: Patterns Action≥70%
 * @cov COV-002
 */

import { AnalyzeActionPattern } from '@/patterns/action/analyze.action';
import { PatternType, ActionType } from '@/patterns/types';

describe('AnalyzeActionPattern (COV-002)', () => {
  /**
   * 测试: Pattern基本结构完整
   */
  it('should have complete pattern structure', () => {
    expect(AnalyzeActionPattern).toBeDefined();
    expect(AnalyzeActionPattern.meta).toBeDefined();
    expect(AnalyzeActionPattern.type).toBe(PatternType.ACTION);
    expect(AnalyzeActionPattern.actionType).toBe(ActionType.ANALYZE);
  });

  /**
   * 测试: 元数据正确
   */
  it('should have correct metadata', () => {
    const { meta } = AnalyzeActionPattern;
    
    expect(meta.id).toBe('act:analyze');
    expect(meta.name).toBe('Analyze Action');
    expect(meta.description).toContain('分析');
    expect(meta.author).toBe('Fabric Team');
    expect(meta.tags).toContain('action');
    expect(meta.tags).toContain('analyze');
    expect(meta.tags).toContain('thinking');
    expect(meta.version).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  /**
   * 测试: 模板内容正确
   */
  it('should have correct template content', () => {
    const { content } = AnalyzeActionPattern;
    
    expect(content).toContain('# ACT:ANALYZE');
    expect(content).toContain('{{input}}');
    expect(content).toContain('{{scope}}');
    expect(content).toContain('{{expectedOutput}}');
  });

  /**
   * 测试: 变量定义完整
   */
  it('should have complete variable definitions', () => {
    const { variables } = AnalyzeActionPattern;
    
    expect(variables).toHaveLength(4);
    
    // 检查必需变量
    const inputVar = variables.find(v => v.name === 'input');
    expect(inputVar).toBeDefined();
    expect(inputVar?.required).toBe(true);
    expect(inputVar?.type).toBe('string');
    
    // 检查可选变量
    const scopeVar = variables.find(v => v.name === 'scope');
    expect(scopeVar).toBeDefined();
    expect(scopeVar?.required).toBe(false);
    expect(scopeVar?.defaultValue).toBe('full');
    
    const expectedOutputVar = variables.find(v => v.name === 'expectedOutput');
    expect(expectedOutputVar).toBeDefined();
    expect(expectedOutputVar?.required).toBe(false);
    
    const constraintsVar = variables.find(v => v.name === 'constraints');
    expect(constraintsVar).toBeDefined();
    expect(constraintsVar?.type).toBe('array');
    expect(constraintsVar?.defaultValue).toEqual([]);
  });

  /**
   * 测试: 步骤定义完整
   */
  it('should have complete step definitions', () => {
    const { steps } = AnalyzeActionPattern;
    
    expect(steps).toHaveLength(4);
    
    // 步骤1: 理解问题
    expect(steps[0].id).toBe('analyze-1');
    expect(steps[0].name).toBe('理解问题');
    expect(steps[0].validation).toBe('必须识别至少一个核心问题');
    
    // 步骤2: 拆解要素
    expect(steps[1].id).toBe('analyze-2');
    expect(steps[1].name).toBe('拆解要素');
    expect(steps[1].validation).toBe('要素之间不能有重叠');
    
    // 步骤3: 分析关联
    expect(steps[2].id).toBe('analyze-3');
    expect(steps[2].name).toBe('分析关联');
    
    // 步骤4: 形成结论
    expect(steps[3].id).toBe('analyze-4');
    expect(steps[3].name).toBe('形成结论');
    expect(steps[3].validation).toBe('结论必须基于前面的分析');
  });

  /**
   * 测试: 前置条件定义
   */
  it('should have preconditions defined', () => {
    const { preconditions } = AnalyzeActionPattern;
    
    expect(preconditions).toHaveLength(2);
    expect(preconditions).toContain('输入内容不为空');
    expect(preconditions).toContain('分析范围已明确');
  });

  /**
   * 测试: 后置条件定义
   */
  it('should have postconditions defined', () => {
    const { postconditions } = AnalyzeActionPattern;
    
    expect(postconditions).toHaveLength(2);
    expect(postconditions).toContain('分析结论已产出');
    expect(postconditions).toContain('关键发现已记录');
  });

  /**
   * 测试: 超时设置
   */
  it('should have timeout configured', () => {
    expect(AnalyzeActionPattern.timeout).toBe(120000);
  });

  /**
   * 测试: Token优化配置
   */
  it('should have token optimization configured', () => {
    const { tokenOpt } = AnalyzeActionPattern;
    
    expect(tokenOpt).toBeDefined();
    expect(tokenOpt?.enabled).toBe(true);
    expect(tokenOpt?.compressionRatio).toBe(0.25);
    expect(tokenOpt?.useAbbreviations).toBe(true);
    expect(tokenOpt?.stripComments).toBe(true);
    expect(tokenOpt?.minifyWhitespace).toBe(true);
  });

  /**
   * 测试: 依赖定义
   */
  it('should have dependencies defined', () => {
    const { dependencies } = AnalyzeActionPattern;
    
    expect(dependencies).toContain('ctx:task');
  });

  /**
   * 测试: 步骤提示词内容
   */
  it('should have meaningful prompts in steps', () => {
    const { steps } = AnalyzeActionPattern;
    
    steps.forEach(step => {
      expect(step.prompt).toBeDefined();
      expect(step.prompt.length).toBeGreaterThan(10);
      expect(step.description).toBeDefined();
    });
  });

  /**
   * 测试: 创建日期有效
   */
  it('should have valid dates', () => {
    const { meta } = AnalyzeActionPattern;
    
    expect(meta.createdAt).toBeInstanceOf(Date);
    expect(meta.updatedAt).toBeInstanceOf(Date);
  });

  /**
   * 测试: 变量描述完整
   */
  it('should have descriptions for all variables', () => {
    const { variables } = AnalyzeActionPattern;
    
    variables.forEach(variable => {
      expect(variable.description).toBeDefined();
      expect(variable.description?.length).toBeGreaterThan(0);
    });
  });

  /**
   * 测试: 步骤验证规则
   */
  it('should have validation rules for critical steps', () => {
    const { steps } = AnalyzeActionPattern;
    
    // 关键步骤应该有验证规则
    const criticalSteps = steps.filter(s => 
      s.id === 'analyze-1' || s.id === 'analyze-2' || s.id === 'analyze-4'
    );
    
    criticalSteps.forEach(step => {
      expect(step.validation).toBeDefined();
    });
  });
});
