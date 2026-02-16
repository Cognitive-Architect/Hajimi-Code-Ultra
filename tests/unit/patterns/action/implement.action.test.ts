/**
 * B-08 Patterns Action测试 - Implement Action Pattern
 * 
 * 覆盖率目标: Patterns Action≥70%
 * @cov COV-002
 */

import { ImplementActionPattern } from '@/patterns/action/implement.action';
import { PatternType, ActionType } from '@/patterns/types';

describe('ImplementActionPattern (COV-002)', () => {
  /**
   * 测试: Pattern基本结构完整
   */
  it('should have complete pattern structure', () => {
    expect(ImplementActionPattern).toBeDefined();
    expect(ImplementActionPattern.meta).toBeDefined();
    expect(ImplementActionPattern.type).toBe(PatternType.ACTION);
    expect(ImplementActionPattern.actionType).toBe(ActionType.IMPLEMENT);
  });

  /**
   * 测试: 元数据正确
   */
  it('should have correct metadata', () => {
    const { meta } = ImplementActionPattern;
    
    expect(meta.id).toBe('act:implement');
    expect(meta.name).toBe('Implement Action');
    expect(meta.description).toContain('实现');
    expect(meta.author).toBe('Fabric Team');
    expect(meta.tags).toContain('action');
    expect(meta.tags).toContain('implement');
    expect(meta.tags).toContain('coding');
    expect(meta.version).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  /**
   * 测试: 模板内容正确
   */
  it('should have correct template content', () => {
    const { content } = ImplementActionPattern;
    
    expect(content).toContain('# ACT:IMPLEMENT');
    expect(content).toContain('{{requirements}}');
    expect(content).toContain('{{specification}}');
    expect(content).toContain('{{context}}');
  });

  /**
   * 测试: 变量定义完整
   */
  it('should have complete variable definitions', () => {
    const { variables } = ImplementActionPattern;
    
    expect(variables).toHaveLength(5);
    
    // 检查必需变量
    const requirementsVar = variables.find(v => v.name === 'requirements');
    expect(requirementsVar).toBeDefined();
    expect(requirementsVar?.required).toBe(true);
    expect(requirementsVar?.type).toBe('string');
    
    // 检查可选变量
    const specificationVar = variables.find(v => v.name === 'specification');
    expect(specificationVar).toBeDefined();
    expect(specificationVar?.required).toBe(false);
    
    const contextVar = variables.find(v => v.name === 'context');
    expect(contextVar).toBeDefined();
    expect(contextVar?.required).toBe(false);
    
    const languageVar = variables.find(v => v.name === 'language');
    expect(languageVar).toBeDefined();
    expect(languageVar?.required).toBe(false);
    expect(languageVar?.defaultValue).toBe('typescript');
    
    const constraintsVar = variables.find(v => v.name === 'constraints');
    expect(constraintsVar).toBeDefined();
    expect(constraintsVar?.type).toBe('array');
    expect(constraintsVar?.defaultValue).toEqual([]);
  });

  /**
   * 测试: 步骤定义完整
   */
  it('should have complete step definitions', () => {
    const { steps } = ImplementActionPattern;
    
    expect(steps).toHaveLength(4);
    
    // 步骤1: 需求理解
    expect(steps[0].id).toBe('impl-1');
    expect(steps[0].name).toBe('需求理解');
    expect(steps[0].validation).toBe('必须明确所有需求点');
    
    // 步骤2: 方案设计
    expect(steps[1].id).toBe('impl-2');
    expect(steps[1].name).toBe('方案设计');
    expect(steps[1].validation).toBe('方案必须满足所有需求');
    
    // 步骤3: 代码实现
    expect(steps[2].id).toBe('impl-3');
    expect(steps[2].name).toBe('代码实现');
    expect(steps[2].validation).toBe('代码必须通过语法检查');
    
    // 步骤4: 自测验证
    expect(steps[3].id).toBe('impl-4');
    expect(steps[3].name).toBe('自测验证');
    expect(steps[3].validation).toBe('所有测试用例必须通过');
  });

  /**
   * 测试: 前置条件定义
   */
  it('should have preconditions defined', () => {
    const { preconditions } = ImplementActionPattern;
    
    expect(preconditions).toHaveLength(2);
    expect(preconditions).toContain('需求已明确');
    expect(preconditions).toContain('技术规范已确定');
  });

  /**
   * 测试: 后置条件定义
   */
  it('should have postconditions defined', () => {
    const { postconditions } = ImplementActionPattern;
    
    expect(postconditions).toHaveLength(2);
    expect(postconditions).toContain('代码已实现');
    expect(postconditions).toContain('自测已通过');
  });

  /**
   * 测试: 超时设置（实现比分析更长）
   */
  it('should have longer timeout for implementation', () => {
    expect(ImplementActionPattern.timeout).toBe(300000);
  });

  /**
   * 测试: Token优化配置
   */
  it('should have token optimization configured', () => {
    const { tokenOpt } = ImplementActionPattern;
    
    expect(tokenOpt).toBeDefined();
    expect(tokenOpt?.enabled).toBe(true);
    expect(tokenOpt?.compressionRatio).toBe(0.25);
  });

  /**
   * 测试: 依赖定义
   */
  it('should have dependencies defined', () => {
    const { dependencies } = ImplementActionPattern;
    
    expect(dependencies).toContain('act:analyze');
    expect(dependencies).toContain('ctx:task');
  });

  /**
   * 测试: 默认编程语言
   */
  it('should default to TypeScript', () => {
    const languageVar = ImplementActionPattern.variables.find(v => v.name === 'language');
    expect(languageVar?.defaultValue).toBe('typescript');
  });

  /**
   * 测试: 实现步骤包含编码相关提示
   */
  it('should have coding-specific prompts', () => {
    const { steps } = ImplementActionPattern;
    
    const codeStep = steps.find(s => s.id === 'impl-3');
    expect(codeStep?.prompt).toContain('代码');
    expect(codeStep?.prompt).toContain('注释');
    
    const testStep = steps.find(s => s.id === 'impl-4');
    expect(testStep?.prompt).toContain('测试');
    expect(testStep?.prompt).toContain('验证');
  });

  /**
   * 测试: 与AnalyzeAction的依赖关系
   */
  it('should depend on analyze action', () => {
    expect(ImplementActionPattern.dependencies).toContain('act:analyze');
  });

  /**
   * 测试: 变量描述包含技术信息
   */
  it('should have technical variable descriptions', () => {
    const { variables } = ImplementActionPattern;
    
    const specVar = variables.find(v => v.name === 'specification');
    expect(specVar?.description).toContain('技术规范');
    
    const langVar = variables.find(v => v.name === 'language');
    expect(langVar?.description).toContain('编程语言');
  });

  /**
   * 测试: 步骤ID命名规范
   */
  it('should follow step ID naming convention', () => {
    const { steps } = ImplementActionPattern;
    
    steps.forEach(step => {
      expect(step.id).toMatch(/^impl-\d+$/);
    });
  });

  /**
   * 测试: 模板使用标准分隔符
   */
  it('should use standard section separators in template', () => {
    const { content } = ImplementActionPattern;
    
    expect(content).toContain('## REQ');
    expect(content).toContain('## SPEC');
    expect(content).toContain('## CTX');
  });
});
