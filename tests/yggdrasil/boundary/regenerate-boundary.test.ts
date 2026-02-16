/**
 * YGGDRASIL P2 - Regenerate边界测试 (B-04)
 * 目标: 覆盖率提升
 */

import { regenerateService } from '@/lib/yggdrasil/regenerate-service';
import { tsa } from '@/lib/tsa';

jest.mock('@/lib/tsa', () => ({
  tsa: {
    keys: jest.fn(),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/core/state', () => ({
  stateMachine: {
    getCurrentState: jest.fn().mockReturnValue('IDLE'),
  },
}));

describe('Regenerate边界测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    regenerateService.resetMetrics();
  });

  // 边界1: 空sessionId
  it('应处理空sessionId', async () => {
    (tsa.keys as jest.Mock).mockReturnValue([]);
    
    const result = await regenerateService.regenerate({ sessionId: '' });
    
    expect(result.success).toBe(true);
    expect(result.clearedKeys).toBe(0);
  });

  // 边界2: 超长sessionId
  it('应处理超长sessionId (1000字符)', async () => {
    const longSessionId = 'a'.repeat(1000);
    (tsa.keys as jest.Mock).mockReturnValue([`session:${longSessionId}:key1`]);
    
    const result = await regenerateService.regenerate({ sessionId: longSessionId });
    
    expect(result.success).toBe(true);
  });

  // 边界3: 特殊字符sessionId
  it('应处理特殊字符sessionId', async () => {
    const specialSessionId = 'test-123_abc.~!@#$%';
    (tsa.keys as jest.Mock).mockReturnValue([`session:${specialSessionId}:key1`]);
    
    const result = await regenerateService.regenerate({ sessionId: specialSessionId });
    
    expect(result.success).toBe(true);
  });

  // 边界4: 大量keys (10,000个)
  it('应处理10000个keys', async () => {
    const keys = Array.from({ length: 10000 }, (_, i) => `session:test:key${i}`);
    (tsa.keys as jest.Mock).mockReturnValue(keys);
    
    const result = await regenerateService.regenerate({ sessionId: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.clearedKeys).toBe(10000);
  });

  // 边界5: delete失败时的容错
  it('应在delete失败时继续执行', async () => {
    (tsa.keys as jest.Mock).mockReturnValue(['session:test:key1', 'session:test:key2']);
    (tsa.delete as jest.Mock)
      .mockRejectedValueOnce(new Error('Delete failed'))
      .mockResolvedValueOnce(undefined);
    
    const result = await regenerateService.regenerate({ sessionId: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.clearedKeys).toBe(1); // 只有一个成功删除
  });

  // 边界6: 所有keys都保留
  it('应处理全部保留的情况', async () => {
    (tsa.keys as jest.Mock).mockReturnValue(['state:current', 'state:history']);
    
    const result = await regenerateService.regenerate({ 
      sessionId: 'test',
      preserveAgentState: true 
    });
    
    expect(result.clearedKeys).toBe(0);
    expect(result.preservedKeys.length).toBe(2);
  });

  // 边界7: 重复的preserveKeys
  it('应处理重复的preserveKeys', async () => {
    (tsa.keys as jest.Mock).mockReturnValue(['key1', 'key2']);
    
    const result = await regenerateService.regenerate({
      sessionId: 'test',
      preserveKeys: ['key1', 'key1', 'key1'], // 重复
    });
    
    expect(result.clearedKeys).toBe(1); // key2被清除
  });

  // 边界8: 并发请求
  it('应处理并发regenerate请求', async () => {
    (tsa.keys as jest.Mock).mockReturnValue(['session:test:key1']);
    
    const promises = [
      regenerateService.regenerate({ sessionId: 'test' }),
      regenerateService.regenerate({ sessionId: 'test' }),
      regenerateService.regenerate({ sessionId: 'test' }),
    ];
    
    const results = await Promise.all(promises);
    
    expect(results.every(r => r.success)).toBe(true);
  });
});
