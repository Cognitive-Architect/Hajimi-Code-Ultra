/**
 * YGGDRASIL Rollback 服务测试 (RLB-001~003)
 * 
 * 测试目标:
 * - RLB-001: 软回滚延迟<500ms
 * - RLB-002: TSA状态同步原子性
 * - RLB-003: 状态机逆向流转
 */

import { rollbackService } from '../rollback-service';
import { stateMachine } from '@/lib/core/state';
import { tsa } from '@/lib/tsa';

jest.mock('@/lib/tsa', () => ({
  tsa: {
    keys: jest.fn().mockReturnValue([]),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/core/state', () => ({
  stateMachine: {
    getCurrentState: jest.fn().mockReturnValue('DESIGN'),
    transition: jest.fn().mockResolvedValue({ success: true }),
  },
}));

describe('Rollback Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RLB-001: 软回滚延迟<500ms', () => {
    it('应创建快照', async () => {
      const snapshot = await rollbackService.createSnapshot('test-session');

      expect(snapshot.id).toBeDefined();
      expect(snapshot.sessionId).toBe('test-session');
      expect(snapshot.state).toBe('DESIGN');
      expect(snapshot.checksum).toBeDefined();
    });

    it('软回滚应在500ms内完成', async () => {
      // 创建快照
      const snapshot = await rollbackService.createSnapshot('test-session');

      // 模拟快照存储
      (tsa.get as jest.Mock).mockResolvedValue(snapshot);

      const startTime = Date.now();
      const result = await rollbackService.softRollback({
        sessionId: 'test-session',
        snapshotId: snapshot.id,
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeLessThan(500);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('RLB-002: TSA状态同步', () => {
    it('应包含Transient键列表', async () => {
      (tsa.keys as jest.Mock).mockReturnValue([
        'session:test:transient:data1',
        'session:test:transient:data2',
        'state:current',
      ]);

      const snapshot = await rollbackService.createSnapshot('test-session');

      expect(snapshot.transientKeys).toContain('session:test:transient:data1');
      expect(snapshot.transientKeys).toContain('session:test:transient:data2');
    });

    it('应包含Staging层数据', async () => {
      (tsa.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'state:current') return Promise.resolve('DESIGN');
        if (key === 'state:history') return Promise.resolve([]);
        return Promise.resolve(null);
      });

      const snapshot = await rollbackService.createSnapshot('test-session');

      expect(snapshot.stagingData['state:current']).toBe('DESIGN');
    });

    it('应有有效的校验和', async () => {
      const snapshot = await rollbackService.createSnapshot('test-session');

      expect(snapshot.checksum).toBeDefined();
      expect(snapshot.checksum.length).toBeGreaterThan(0);
    });
  });

  describe('RLB-003: 状态机逆向流转', () => {
    it('软回滚应触发状态流转', async () => {
      const snapshot = await rollbackService.createSnapshot('test-session');
      (tsa.get as jest.Mock).mockResolvedValue(snapshot);

      await rollbackService.softRollback({
        sessionId: 'test-session',
        snapshotId: snapshot.id,
      });

      expect(stateMachine.transition).toHaveBeenCalledWith(
        'DESIGN',
        'system',
        expect.objectContaining({
          reason: 'Rollback to snapshot',
          snapshotId: snapshot.id,
        })
      );
    });

    it('应记录状态变化', async () => {
      const snapshot = await rollbackService.createSnapshot('test-session');
      (tsa.get as jest.Mock).mockResolvedValue(snapshot);

      const result = await rollbackService.softRollback({
        sessionId: 'test-session',
        snapshotId: snapshot.id,
      });

      expect(result.previousState).toBeDefined();
      expect(result.currentState).toBeDefined();
    });
  });

  describe('快照管理', () => {
    it('应能获取快照列表', async () => {
      // 创建多个快照
      await rollbackService.createSnapshot('test-session');
      await rollbackService.createSnapshot('test-session');

      const snapshots = await rollbackService.getSnapshots('test-session');
      expect(Array.isArray(snapshots)).toBe(true);
    });

    it('应能清理过期快照', async () => {
      const cleaned = await rollbackService.cleanupSnapshots('test-session', 0);
      expect(typeof cleaned).toBe('number');
    });
  });

  describe('性能指标', () => {
    it('应记录回滚操作数', async () => {
      const initialMetrics = rollbackService.getMetrics();

      const snapshot = await rollbackService.createSnapshot('test-session');
      (tsa.get as jest.Mock).mockResolvedValue(snapshot);

      await rollbackService.softRollback({
        sessionId: 'test-session',
        snapshotId: snapshot.id,
      });

      const newMetrics = rollbackService.getMetrics();
      expect(newMetrics.totalRollbacks).toBe(initialMetrics.totalRollbacks + 1);
    });
  });
});
