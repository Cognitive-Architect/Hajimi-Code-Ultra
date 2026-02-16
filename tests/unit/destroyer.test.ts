/**
 * 自毁模块测试
 * 自测点: DEST-001 - 自毁验证（容器已删除，无残留）
 */

import { Destroyer, DestructionStatus, DestroyerConfig } from '../../lib/sandbox/destroyer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Destroyer - 自毁模块', () => {
  let destroyer: Destroyer;
  let testConfig: Partial<DestroyerConfig>;
  let tempBasePath: string;

  beforeEach(async () => {
    // 创建临时测试目录
    tempBasePath = path.join(os.tmpdir(), `sandbox-test-${Date.now()}`);
    await fs.mkdir(tempBasePath, { recursive: true });

    testConfig = {
      runtime: 'docker',
      force: true,
      removeImages: false,
      timeoutMs: 5000,
      tempBasePath: path.join(tempBasePath, 'temp'),
      overlayBasePath: path.join(tempBasePath, 'overlays'),
    };

    destroyer = new Destroyer(testConfig);
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(tempBasePath, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('DEST-001: 自毁验证', () => {
    it('应能调度延迟自毁任务', async () => {
      const executionId = 'test-exec-001';
      const delayMs = 1000;

      const task = await destroyer.schedule(executionId, delayMs);

      expect(task).toBeDefined();
      expect(task.executionId).toBe(executionId);
      expect(task.status).toBe(DestructionStatus.SCHEDULED);
      expect(task.executeAt).toBeGreaterThan(task.scheduledAt);
      expect(task.cleanupTargets.length).toBeGreaterThan(0);
    });

    it('应能立即执行自毁', async () => {
      const executionId = 'test-exec-002';
      
      // 创建模拟的临时文件和目录
      const tempPath = path.join(testConfig.tempBasePath!, executionId);
      const overlayPath = path.join(testConfig.overlayBasePath!, executionId);
      await fs.mkdir(tempPath, { recursive: true });
      await fs.mkdir(overlayPath, { recursive: true });
      await fs.writeFile(path.join(tempPath, 'test.txt'), 'test', 'utf-8');

      // 先调度任务
      await destroyer.schedule(executionId, 60000);

      // 立即执行
      const result = await destroyer.executeNow(executionId);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.destroyedAt).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.targets.length).toBeGreaterThan(0);
      expect(result.residualCheck).toBeDefined();
      
      // 验证无残留检查
      expect(result.residualCheck.passed).toBe(true);
      expect(result.residualCheck.checks.tempFilesExist).toBe(false);
      expect(result.residualCheck.checks.overlayExists).toBe(false);
    });

    it('应验证销毁后无残留文件', async () => {
      const executionId = 'test-exec-003';

      // 创建测试文件结构
      const testFiles = [
        path.join(testConfig.tempBasePath!, executionId, 'file1.txt'),
        path.join(testConfig.tempBasePath!, executionId, 'subdir', 'file2.txt'),
        path.join(testConfig.overlayBasePath!, executionId, 'layer', 'data.bin'),
      ];

      for (const file of testFiles) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, 'test data', 'utf-8');
      }

      // 执行销毁
      await destroyer.schedule(executionId, 100);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 验证销毁
      const verification = await destroyer.verifyDestruction(executionId);

      expect(verification.verified).toBe(true);
      expect(verification.checks.passed).toBe(true);
      expect(verification.checks.checks.tempFilesExist).toBe(false);
      expect(verification.checks.checks.overlayExists).toBe(false);
    });

    it('应正确报告销毁目标状态', async () => {
      const executionId = 'test-exec-004';

      const task = await destroyer.schedule(executionId, 1000);

      expect(task.cleanupTargets).toContainEqual(
        expect.objectContaining({
          type: 'container',
          path: executionId,
          verified: false,
        })
      );
      expect(task.cleanupTargets).toContainEqual(
        expect.objectContaining({
          type: 'overlay',
          path: expect.stringContaining(executionId),
          verified: false,
        })
      );
      expect(task.cleanupTargets).toContainEqual(
        expect.objectContaining({
          type: 'temp',
          path: expect.stringContaining(executionId),
          verified: false,
        })
      );
    });

    it('应能取消调度的自毁', async () => {
      const executionId = 'test-exec-005';

      await destroyer.schedule(executionId, 5000);
      const cancelled = destroyer.cancel(executionId);

      expect(cancelled).toBe(true);

      const task = destroyer.getTask(executionId);
      expect(task?.status).toBe(DestructionStatus.CANCELLED);
    });

    it('应正确计算销毁耗时', async () => {
      const executionId = 'test-exec-006';

      // 创建测试目录
      const tempPath = path.join(testConfig.tempBasePath!, executionId);
      await fs.mkdir(tempPath, { recursive: true });

      // 调度后立即执行，不使用定时器
      await destroyer.schedule(executionId, 60000);
      const result = await destroyer.executeNow(executionId);

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.destroyedAt).toBeGreaterThan(0);
    });
  });

  describe('清理目标覆盖', () => {
    it('应覆盖所有清理目标类型', () => {
      const executionId = 'test-coverage';
      const task = destroyer.schedule(executionId, 1000);

      const targetTypes = ['container', 'overlay', 'mount', 'temp', 'volume'];
      targetTypes.forEach((type) => {
        expect(task).resolves.toHaveProperty(
          'cleanupTargets',
          expect.arrayContaining([
            expect.objectContaining({ type }),
          ])
        );
      });
    });
  });
});
