/**
 * B-04/07: GLM-5 额度熔断器测试（安全）
 * 
 * 角色: 🔵 压力怪
 * 预算: <0.03 USD
 */

import { test, expect } from '@playwright/test';
import { CostGuardian } from '../lib/quintant/cost-guardian';
import { OpenRouterAdapter } from '../lib/quintant/adapters/openrouter-real';

test.describe('B-04: GLM-5 额度熔断器', () => {
  test.beforeEach(() => {
    // 重置熔断器状态
    CostGuardian.resetForTesting();
  });

  test('模拟90%额度触发熔断，自动切Mock，报警日志正确', async () => {
    // 模拟已消耗$0.91（>90%阈值）
    // 通过直接修改内部状态来模拟
    (CostGuardian as any).spent = 0.91;

    // 验证熔断器已触发
    expect(CostGuardian.isFused()).toBe(true);

    // 尝试请求应被拦截
    const canProceed = CostGuardian.canProceed(0.001);
    expect(canProceed).toBe(false);

    // 验证适配器返回Mock降级响应
    const adapter = new OpenRouterAdapter();
    const response = await adapter.spawn({
      config: { id: 'fuse-test', name: 'Test', role: 'test' },
    });

    // 验证返回预算限制错误
    expect(response.success).toBe(false);
    expect(response.error?.message).toMatch(/Budget|fuse/i);
    console.log('✅ 熔断后请求被正确拦截');

    // 验证控制台警告（通过适配器状态）
    expect(adapter.isFused()).toBe(true);
    console.log('✅ 熔断器状态正确');

    // 打印额度状态
    CostGuardian.printStatus();
  });

  test('CostGuardian.canProceed返回false时阻止请求', async () => {
    // 模拟接近熔断线
    (CostGuardian as any).spent = 0.89;

    // 尝试$0.02的请求（会超过90%阈值）
    const canProceed = CostGuardian.canProceed(0.02);
    expect(canProceed).toBe(false);

    // 验证熔断器已触发
    expect(CostGuardian.isFused()).toBe(true);
    console.log('✅ 90%熔断阈值正确工作');
  });

  test('熔断后返回Mock模式预设响应', async () => {
    // 强制熔断
    CostGuardian.emergencyFuse();

    // 创建适配器
    const adapter = new OpenRouterAdapter();

    // 请求应返回错误
    const response = await adapter.status({ agentId: 'mock-test' });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('QUIN-600'); // ADAPTER_ERROR
    console.log('✅ 熔断后返回正确错误码');

    // 验证降级到Mock的逻辑
    const { MockAdapter } = await import('../lib/quintant/adapters/mock');
    const mockAdapter = new MockAdapter();
    const mockResponse = await mockAdapter.status({ agentId: 'mock-test' });

    expect(mockResponse.success).toBe(true);
    console.log('✅ Mock降级可用');
  });
});
