/**
 * B-08 Hooks测试 - Hooks 统一导出模块
 * 
 * 覆盖率目标: 整体≥80%
 * @cov COV-001
 */

describe('Hooks Index Module (COV-001)', () => {
  /**
   * 测试: useTSA 导出
   */
  it('should export useTSA hook', () => {
    const hooks = require('@/app/hooks');
    expect(hooks.useTSA).toBeDefined();
    expect(typeof hooks.useTSA).toBe('function');
  });

  /**
   * 测试: useAgent 导出
   */
  it('should export useAgent hook', () => {
    const hooks = require('@/app/hooks');
    expect(hooks.useAgent).toBeDefined();
    expect(typeof hooks.useAgent).toBe('function');
  });

  /**
   * 测试: useGovernance 导出
   */
  it('should export useGovernance hook', () => {
    const hooks = require('@/app/hooks');
    expect(hooks.useGovernance).toBeDefined();
    expect(typeof hooks.useGovernance).toBe('function');
  });

  /**
   * 测试: useSandbox 导出
   */
  it('should export useSandbox hook', () => {
    const hooks = require('@/app/hooks');
    expect(hooks.useSandbox).toBeDefined();
    expect(typeof hooks.useSandbox).toBe('function');
  });

  /**
   * 测试: useCodeRiskAssessment 导出
   */
  it('should export useCodeRiskAssessment hook', () => {
    const hooks = require('@/app/hooks');
    expect(hooks.useCodeRiskAssessment).toBeDefined();
    expect(typeof hooks.useCodeRiskAssessment).toBe('function');
  });

  /**
   * 测试: useExecutionHistory 导出
   */
  it('should export useExecutionHistory hook', () => {
    const hooks = require('@/app/hooks');
    expect(hooks.useExecutionHistory).toBeDefined();
    expect(typeof hooks.useExecutionHistory).toBe('function');
  });

  /**
   * 测试: 类型导出
   */
  it('should export types', () => {
    const hooks = require('@/app/hooks');
    // 类型在TypeScript编译后不存在于运行时，但模块应该可以加载
    expect(hooks).toBeDefined();
  });
});
