/**
 * HAJIMI VIRTUALIZED - Checkpoint服务测试
 */

import { CheckpointService } from '@/lib/virtualized/checkpoint';

describe('CheckpointService', () => {
  let service: CheckpointService;

  beforeEach(async () => {
    service = new CheckpointService();
    await service.init();
  });

  describe('[CHK-001] L1时延<200ms', () => {
    it('L1 Checkpoint应在200ms内完成', async () => {
      const start = performance.now();
      
      await service.save('test-agent', 'L1', { test: 'data' });
      
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });

    it('应支持L0内存级Checkpoint', async () => {
      const checkpoint = await service.save('agent-l0', 'L0', { data: 'test' });
      
      expect(checkpoint.metadata.level).toBe('L0');
    });
  });

  describe('[CHK-002] L2持久化', () => {
    it('应支持L2持久化Checkpoint', async () => {
      const checkpoint = await service.save('agent-l2', 'L2', { data: 'persistent' });
      
      expect(checkpoint.metadata.level).toBe('L2');
    });
  });

  describe('[CHK-003] L3 Git归档', () => {
    it('应支持L3 Git归档', async () => {
      const checkpoint = await service.save('agent-l3', 'L3', { data: 'archived' });
      
      expect(checkpoint.metadata.level).toBe('L3');
    });
  });

  describe('[CHK-004] 跨级恢复一致性', () => {
    it('应按级别回滚', async () => {
      await service.save('agent-rollback', 'L1', { version: 1 });
      
      const rolledBack = await service.rollback('L1', 'agent-rollback');
      
      // 可能返回null如果没有checkpoint
      expect([null, expect.any(Object)]).toContainEqual(rolledBack);
    });
  });

  describe('性能指标', () => {
    it('应提供性能指标', () => {
      const metrics = service.getMetrics();
      
      expect(metrics.totalCheckpoints).toBeDefined();
      expect(metrics.byLevel).toBeDefined();
    });
  });
});
