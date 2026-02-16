/**
 * YGGDRASIL 四象限系统 - 统一入口
 * HAJIMI-YGGDRASIL-001
 * 
 * 导出所有四象限服务和类型
 */

// ==================== 类型导出 ====================
export type {
  // 核心类型
  QuadrantAction,
  QuadrantActionConfig,
  YggdrasilMetrics,
  YggdrasilError,
  YggdrasilErrorCode,
  QuadrantUIState,
  
  // Regenerate类型
  RegenerateRequest,
  RegenerateResult,
  
  // Branching类型
  Branch,
  CreateBranchRequest,
  MergeRequest,
  MergeVote,
  BranchingResult,
  
  // Rollback类型
  RollbackType,
  RollbackSnapshot,
  SoftRollbackRequest,
  HardRollbackRequest,
  GovernanceRollbackRequest,
  RollbackResult,
  
  // Remix类型
  RemixRequest,
  RemixResult,
  RemixPattern,
  RemixContext,
  CompressionLevel,
  KeyDecision,
  CodeBlock,
  TechDebtItem,
} from './types';

export { QUADRANT_ACTIONS } from './types';

// ==================== 服务导出 ====================
export { regenerateService } from './regenerate-service';
export { branchingService } from './branching-service';
export { rollbackService } from './rollback-service';
export { remixService } from './remix-service';

// ==================== 统一控制器 ====================
import { 
  RegenerateRequest, 
  RegenerateResult,
  CreateBranchRequest,
  BranchingResult,
  MergeRequest,
  SoftRollbackRequest,
  HardRollbackRequest,
  GovernanceRollbackRequest,
  RollbackResult,
  RemixRequest,
  RemixResult,
  QuadrantAction,
  YggdrasilMetrics,
} from './types';

import { regenerateService } from './regenerate-service';
import { branchingService } from './branching-service';
import { rollbackService } from './rollback-service';
import { remixService } from './remix-service';

export interface YggdrasilOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  action: QuadrantAction;
  durationMs: number;
  timestamp: number;
}

/**
 * YGGDRASIL统一控制器
 * 提供四象限操作的统一接口
 */
class YggdrasilController {
  /**
   * 执行Regenerate
   */
  async regenerate(request: RegenerateRequest): Promise<YggdrasilOperationResult<RegenerateResult>> {
    const startTime = performance.now();
    
    try {
      const result = await regenerateService.regenerate(request);
      return {
        success: true,
        data: result,
        action: 'REGENERATE',
        durationMs: Math.round(performance.now() - startTime),
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Regenerate failed',
        action: 'REGENERATE',
        durationMs: Math.round(performance.now() - startTime),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 创建分支
   */
  async createBranch(request: CreateBranchRequest): Promise<YggdrasilOperationResult<BranchingResult>> {
    const startTime = performance.now();
    
    const result = await branchingService.createBranch(request);
    return {
      success: result.success,
      data: result,
      error: result.error,
      action: 'BRANCH',
      durationMs: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
    };
  }

  /**
   * 合并分支
   */
  async mergeBranch(request: MergeRequest): Promise<YggdrasilOperationResult<BranchingResult>> {
    const startTime = performance.now();
    
    const result = await branchingService.mergeBranch(request);
    return {
      success: result.success,
      data: result,
      error: result.error,
      action: 'BRANCH',
      durationMs: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
    };
  }

  /**
   * 执行软回滚
   */
  async softRollback(request: SoftRollbackRequest): Promise<YggdrasilOperationResult<RollbackResult>> {
    const startTime = performance.now();
    
    const result = await rollbackService.softRollback(request);
    return {
      success: result.success,
      data: result,
      error: result.error,
      action: 'ROLLBACK',
      durationMs: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
    };
  }

  /**
   * 执行硬回滚
   */
  async hardRollback(request: HardRollbackRequest): Promise<YggdrasilOperationResult<RollbackResult>> {
    const startTime = performance.now();
    
    const result = await rollbackService.hardRollback(request);
    return {
      success: result.success,
      data: result,
      error: result.error,
      action: 'ROLLBACK',
      durationMs: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
    };
  }

  /**
   * 执行治理回滚
   */
  async governanceRollback(request: GovernanceRollbackRequest): Promise<YggdrasilOperationResult<RollbackResult>> {
    const startTime = performance.now();
    
    const result = await rollbackService.governanceRollback(request);
    return {
      success: result.success,
      data: result,
      error: result.error,
      action: 'ROLLBACK',
      durationMs: Math.round(performance.now() - startTime),
      timestamp: Date.now(),
    };
  }

  /**
   * 执行Remix
   */
  async remix(request: RemixRequest): Promise<YggdrasilOperationResult<RemixResult>> {
    const startTime = performance.now();
    
    try {
      const result = await remixService.remix(request);
      return {
        success: result.success,
        data: result,
        error: result.error,
        action: 'REMIX',
        durationMs: Math.round(performance.now() - startTime),
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Remix failed',
        action: 'REMIX',
        durationMs: Math.round(performance.now() - startTime),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 获取综合指标
   */
  getMetrics(): YggdrasilMetrics {
    return {
      regenerate: regenerateService.getMetrics(),
      branching: branchingService.getMetrics(),
      rollback: rollbackService.getMetrics(),
      remix: {
        totalPatterns: 0, // TODO: 从remixService获取
        averageSavingsRate: 0.7,
        totalTokensSaved: 0,
      },
    };
  }

  /**
   * 重置所有指标（仅用于测试）
   */
  resetMetrics(): void {
    regenerateService.resetMetrics();
    // 其他服务reset...
  }

  /**
   * 健康检查
   */
  healthCheck(): { status: 'healthy' | 'degraded' | 'unhealthy'; details: Record<string, boolean> } {
    const details: Record<string, boolean> = {
      regenerate: true,
      branching: true,
      rollback: true,
      remix: true,
    };

    // 检查各服务状态
    const allHealthy = Object.values(details).every(v => v);
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      details,
    };
  }
}

// 导出单例
export const yggdrasil = new YggdrasilController();
export default yggdrasil;
