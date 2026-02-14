/**
 * 奶龙娘·清道夫 - 自毁模块
 * Phase B-06: 自动清理与销毁
 * 
 * 功能：
 * - 延迟/立即自毁容器
 * - 清理OverlayFS层
 * - 清理挂载点
 * - 验证无残留
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ==================== 类型定义 ====================

export interface DestroyerConfig {
  /** 容器运行时 (docker/podman) */
  runtime: 'docker' | 'podman';
  /** 强制清理 */
  force: boolean;
  /** 同时删除镜像 */
  removeImages: boolean;
  /** 清理超时(ms) */
  timeoutMs: number;
  /** 临时目录路径 */
  tempBasePath: string;
  /** 覆盖层存储路径 */
  overlayBasePath: string;
}

export interface DestructionTask {
  executionId: string;
  containerId: string;
  scheduledAt: number;
  executeAt: number;
  status: DestructionStatus;
  cleanupTargets: CleanupTarget[];
  result?: DestructionResult;
}

export enum DestructionStatus {
  SCHEDULED = 'scheduled',
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface CleanupTarget {
  type: 'container' | 'overlay' | 'mount' | 'volume' | 'temp';
  path: string;
  verified: boolean;
}

export interface DestructionResult {
  success: boolean;
  destroyedAt: number;
  durationMs: number;
  targets: CleanupTarget[];
  errors: DestructionError[];
  residualCheck: ResidualCheckResult;
}

export interface DestructionError {
  target: string;
  code: string;
  message: string;
  recoverable: boolean;
}

export interface ResidualCheckResult {
  passed: boolean;
  checks: {
    containerExists: boolean;
    overlayExists: boolean;
    mountExists: boolean;
    tempFilesExist: boolean;
  };
  details: string[];
}

export interface VerificationResult {
  executionId: string;
  verified: boolean;
  timestamp: number;
  checks: ResidualCheckResult;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: DestroyerConfig = {
  runtime: 'docker',
  force: true,
  removeImages: false,
  timeoutMs: 30000,
  tempBasePath: '/tmp/sandbox',
  overlayBasePath: '/var/lib/sandbox/overlays',
};

// ==================== Destroyer类 ====================

export class Destroyer {
  private config: DestroyerConfig;
  private tasks: Map<string, DestructionTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<DestroyerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 调度延迟自毁
   * @param executionId 执行ID
   * @param delayMs 延迟毫秒数
   * @param containerId 容器ID（可选，默认为executionId）
   * @returns 销毁任务
   */
  async schedule(
    executionId: string,
    delayMs: number,
    containerId?: string
  ): Promise<DestructionTask> {
    const now = Date.now();
    const targetContainer = containerId || executionId;

    const task: DestructionTask = {
      executionId,
      containerId: targetContainer,
      scheduledAt: now,
      executeAt: now + delayMs,
      status: DestructionStatus.SCHEDULED,
      cleanupTargets: this.buildCleanupTargets(executionId, targetContainer),
    };

    this.tasks.set(executionId, task);

    // 设置定时器
    const timer = setTimeout(() => {
      this.executeNow(executionId).catch((err) => {
        console.error(`[Destroyer] 自动销毁失败 ${executionId}:`, err);
      });
    }, delayMs);

    this.timers.set(executionId, timer);

    console.log(`[Destroyer] 已调度自毁: ${executionId}, ${delayMs}ms后执行`);
    return task;
  }

  /**
   * 立即执行自毁
   * @param executionId 执行ID
   * @returns 销毁结果
   */
  async executeNow(executionId: string): Promise<DestructionResult> {
    const task = this.tasks.get(executionId);
    if (!task) {
      throw new Error(`未找到销毁任务: ${executionId}`);
    }

    // 清除定时器
    const timer = this.timers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(executionId);
    }

    const startTime = Date.now();
    task.status = DestructionStatus.IN_PROGRESS;

    const errors: DestructionError[] = [];
    const targets: CleanupTarget[] = [];

    try {
      // 1. 停止并删除容器
      const containerResult = await this.destroyContainer(task.containerId);
      targets.push(...containerResult.targets);
      errors.push(...containerResult.errors);

      // 2. 删除OverlayFS层
      const overlayResult = await this.destroyOverlayFS(executionId);
      targets.push(...overlayResult.targets);
      errors.push(...overlayResult.errors);

      // 3. 清理/tmp挂载点
      const mountResult = await this.cleanupMounts(executionId);
      targets.push(...mountResult.targets);
      errors.push(...mountResult.errors);

      // 4. 清理临时文件
      const tempResult = await this.cleanupTempFiles(executionId);
      targets.push(...tempResult.targets);
      errors.push(...tempResult.errors);

      // 5. 残留验证
      const residualCheck = await this.performResidualCheck(
        executionId,
        task.containerId,
        targets
      );

      const result: DestructionResult = {
        success: errors.length === 0 || errors.every((e) => e.recoverable),
        destroyedAt: Date.now(),
        durationMs: Date.now() - startTime,
        targets,
        errors,
        residualCheck,
      };

      task.status = result.success ? DestructionStatus.COMPLETED : DestructionStatus.FAILED;
      task.result = result;

      console.log(`[Destroyer] 自毁完成: ${executionId}, 耗时${result.durationMs}ms`);
      return result;
    } catch (error) {
      const errorResult: DestructionResult = {
        success: false,
        destroyedAt: Date.now(),
        durationMs: Date.now() - startTime,
        targets,
        errors: [
          ...errors,
          {
            target: executionId,
            code: 'DESTRUCTION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
          },
        ],
        residualCheck: {
          passed: false,
          checks: {
            containerExists: true,
            overlayExists: true,
            mountExists: true,
            tempFilesExist: true,
          },
          details: ['销毁过程中发生致命错误'],
        },
      };

      task.status = DestructionStatus.FAILED;
      task.result = errorResult;
      return errorResult;
    }
  }

  /**
   * 验证销毁结果
   * @param executionId 执行ID
   * @returns 验证结果
   */
  async verifyDestruction(executionId: string): Promise<VerificationResult> {
    const task = this.tasks.get(executionId);
    if (!task) {
      throw new Error(`未找到销毁任务: ${executionId}`);
    }

    const residualCheck = await this.performResidualCheck(
      executionId,
      task.containerId,
      task.cleanupTargets
    );

    return {
      executionId,
      verified: residualCheck.passed,
      timestamp: Date.now(),
      checks: residualCheck,
    };
  }

  /**
   * 取消调度的自毁
   * @param executionId 执行ID
   */
  cancel(executionId: string): boolean {
    const timer = this.timers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(executionId);

      const task = this.tasks.get(executionId);
      if (task) {
        task.status = DestructionStatus.CANCELLED;
      }

      console.log(`[Destroyer] 已取消自毁: ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * 获取任务状态
   * @param executionId 执行ID
   */
  getTask(executionId: string): DestructionTask | undefined {
    return this.tasks.get(executionId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): DestructionTask[] {
    return Array.from(this.tasks.values());
  }

  // ==================== 私有方法 ====================

  private buildCleanupTargets(executionId: string, containerId: string): CleanupTarget[] {
    return [
      { type: 'container', path: containerId, verified: false },
      { type: 'overlay', path: path.join(this.config.overlayBasePath, executionId), verified: false },
      { type: 'mount', path: path.join('/tmp/sandbox', executionId), verified: false },
      { type: 'temp', path: path.join(this.config.tempBasePath, executionId), verified: false },
      { type: 'volume', path: `sandbox-vol-${executionId}`, verified: false },
    ];
  }

  private async destroyContainer(containerId: string): Promise<{
    targets: CleanupTarget[];
    errors: DestructionError[];
  }> {
    const targets: CleanupTarget[] = [];
    const errors: DestructionError[] = [];

    try {
      // 先停止容器
      const stopCmd = `${this.config.runtime} stop ${this.config.force ? '-f ' : ''}${containerId} 2>&1 || true`;
      await execAsync(stopCmd, { timeout: this.config.timeoutMs });

      // 删除容器
      const rmCmd = `${this.config.runtime} rm ${this.config.force ? '-f ' : ''}${containerId} 2>&1 || true`;
      await execAsync(rmCmd, { timeout: this.config.timeoutMs });

      targets.push({ type: 'container', path: containerId, verified: true });
      console.log(`[Destroyer] 容器已删除: ${containerId}`);
    } catch (error) {
      errors.push({
        target: containerId,
        code: 'CONTAINER_DESTROY_FAILED',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      targets.push({ type: 'container', path: containerId, verified: false });
    }

    return { targets, errors };
  }

  private async destroyOverlayFS(executionId: string): Promise<{
    targets: CleanupTarget[];
    errors: DestructionError[];
  }> {
    const targets: CleanupTarget[] = [];
    const errors: DestructionError[] = [];

    const overlayPath = path.join(this.config.overlayBasePath, executionId);

    try {
      // 检查目录是否存在
      await fs.access(overlayPath);

      // 递归删除
      await fs.rm(overlayPath, { recursive: true, force: true });

      targets.push({ type: 'overlay', path: overlayPath, verified: true });
      console.log(`[Destroyer] OverlayFS层已删除: ${overlayPath}`);
    } catch (error) {
      // 目录不存在不算错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push({
          target: overlayPath,
          code: 'OVERLAY_DESTROY_FAILED',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
        targets.push({ type: 'overlay', path: overlayPath, verified: false });
      } else {
        targets.push({ type: 'overlay', path: overlayPath, verified: true });
      }
    }

    return { targets, errors };
  }

  private async cleanupMounts(executionId: string): Promise<{
    targets: CleanupTarget[];
    errors: DestructionError[];
  }> {
    const targets: CleanupTarget[] = [];
    const errors: DestructionError[] = [];

    const mountPath = path.join('/tmp/sandbox', executionId);

    try {
      // 检查挂载点是否存在
      await fs.access(mountPath);

      // 尝试卸载（如果已挂载）
      try {
        const umountCmd = `umount -f ${mountPath} 2>&1 || true`;
        await execAsync(umountCmd, { timeout: 5000 });
      } catch {
        // 忽略卸载错误
      }

      // 删除挂载点目录
      await fs.rm(mountPath, { recursive: true, force: true });

      targets.push({ type: 'mount', path: mountPath, verified: true });
      console.log(`[Destroyer] 挂载点已清理: ${mountPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push({
          target: mountPath,
          code: 'MOUNT_CLEANUP_FAILED',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
        targets.push({ type: 'mount', path: mountPath, verified: false });
      } else {
        targets.push({ type: 'mount', path: mountPath, verified: true });
      }
    }

    return { targets, errors };
  }

  private async cleanupTempFiles(executionId: string): Promise<{
    targets: CleanupTarget[];
    errors: DestructionError[];
  }> {
    const targets: CleanupTarget[] = [];
    const errors: DestructionError[] = [];

    const tempPath = path.join(this.config.tempBasePath, executionId);

    try {
      await fs.access(tempPath);
      await fs.rm(tempPath, { recursive: true, force: true });

      targets.push({ type: 'temp', path: tempPath, verified: true });
      console.log(`[Destroyer] 临时文件已清理: ${tempPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push({
          target: tempPath,
          code: 'TEMP_CLEANUP_FAILED',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
        targets.push({ type: 'temp', path: tempPath, verified: false });
      } else {
        targets.push({ type: 'temp', path: tempPath, verified: true });
      }
    }

    return { targets, errors };
  }

  private async performResidualCheck(
    executionId: string,
    containerId: string,
    targets: CleanupTarget[]
  ): Promise<ResidualCheckResult> {
    const checks = {
      containerExists: false,
      overlayExists: false,
      mountExists: false,
      tempFilesExist: false,
    };
    const details: string[] = [];

    // 检查容器是否存在
    try {
      const { stdout } = await execAsync(
        `${this.config.runtime} ps -a --filter "id=${containerId}" --format "{{.ID}}"`,
        { timeout: 5000 }
      );
      checks.containerExists = stdout.trim().length > 0;
      if (checks.containerExists) {
        details.push(`容器 ${containerId} 仍存在`);
      }
    } catch {
      // 命令失败视为不存在
    }

    // 检查OverlayFS层
    const overlayPath = path.join(this.config.overlayBasePath, executionId);
    try {
      await fs.access(overlayPath);
      checks.overlayExists = true;
      details.push(`OverlayFS层 ${overlayPath} 仍存在`);
    } catch {
      checks.overlayExists = false;
    }

    // 检查挂载点
    const mountPath = path.join('/tmp/sandbox', executionId);
    try {
      await fs.access(mountPath);
      checks.mountExists = true;
      details.push(`挂载点 ${mountPath} 仍存在`);
    } catch {
      checks.mountExists = false;
    }

    // 检查临时文件
    const tempPath = path.join(this.config.tempBasePath, executionId);
    try {
      await fs.access(tempPath);
      checks.tempFilesExist = true;
      details.push(`临时目录 ${tempPath} 仍存在`);
    } catch {
      checks.tempFilesExist = false;
    }

    const passed =
      !checks.containerExists &&
      !checks.overlayExists &&
      !checks.mountExists &&
      !checks.tempFilesExist;

    if (passed) {
      details.push('所有残留检查通过');
    }

    return {
      passed,
      checks,
      details,
    };
  }
}

// ==================== 便捷函数 ====================

export function createDestroyer(config?: Partial<DestroyerConfig>): Destroyer {
  return new Destroyer(config);
}

// ==================== 导出默认 ====================

export default Destroyer;
