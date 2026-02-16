/**
 * HAJIMI VIRTUALIZED - API路由: /api/virtualized/rollback
 * 
 * 工单 6/6: API层暴露与YGGDRASIL四象限集成
 * 
 * 快捷键绑定: Ctrl+Z
 * 调用: Checkpoint
 * 
 * 参考规范:
 * - ID-78（YGGDRASIL聊天治理四象限）
 * - ID-77（Phase 5人格化UI）
 * 
 * @module api/virtualized/rollback
 * @version 1.0.0
 */

import { CheckpointService } from '../../../../lib/virtualized/checkpoint';

/**
 * Rollback请求体
 */
interface RollbackRequest {
  /** Checkpoint ID */
  checkpointId?: string;
  /** 回滚级别（YGGDRASIL四象限） */
  level?: 'L0' | 'L1' | 'L2' | 'L3';
  /** Agent ID */
  agentId?: string;
  /** 回滚原因 */
  reason?: string;
}

/**
 * Rollback响应
 */
interface RollbackResponse {
  /** 是否成功 */
  success: boolean;
  /** 恢复的Checkpoint ID */
  checkpointId?: string;
  /** Agent ID */
  agentId?: string;
  /** 恢复耗时（ms） */
  restoreTime?: number;
  /** 错误信息 */
  error?: string;
  /** 时间戳 */
  timestamp: number;
}

// 全局Checkpoint服务实例
const checkpointService = new CheckpointService();

/**
 * POST /api/virtualized/rollback
 * 
 * 执行YGGDRASIL回滚
 * 快捷键: Ctrl+Z
 * 调用: Checkpoint
 * 
 * @param request - HTTP请求
 * @returns HTTP响应
 */
export async function POST(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    // 初始化服务
    await checkpointService.init();
    
    // 解析请求体
    const body: RollbackRequest = await request.json();
    
    // 验证必需参数
    if (!body.checkpointId && !body.level) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameter: checkpointId or level',
          timestamp,
        } as RollbackResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let result;

    // 支持按级别回滚（YGGDRASIL四象限）
    if (body.level && body.agentId) {
      const checkpoint = await checkpointService.rollback(body.level, body.agentId);
      
      if (!checkpoint) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `No checkpoint found for level ${body.level} and agent ${body.agentId}`,
            timestamp,
          } as RollbackResponse),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      result = {
        success: true,
        agentId: checkpoint.metadata.agentId,
        checkpointId: checkpoint.metadata.id,
        restoreTime: 0, // 实际恢复时间由resume方法返回
      };
    } else if (body.checkpointId) {
      // 按Checkpoint ID恢复
      const resumeResult = await checkpointService.resume(body.checkpointId);
      
      result = {
        success: resumeResult.success,
        agentId: resumeResult.agentId,
        checkpointId: resumeResult.checkpointId,
        restoreTime: resumeResult.restoreTime,
      };
      
      if (!resumeResult.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: resumeResult.error || 'Resume failed',
            timestamp,
          } as RollbackResponse),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing agentId for level-based rollback',
          timestamp,
        } as RollbackResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 返回成功响应
    const response: RollbackResponse = {
      success: true,
      checkpointId: result.checkpointId,
      agentId: result.agentId,
      restoreTime: result.restoreTime,
      timestamp,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // 返回错误响应
    const response: RollbackResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp,
    };

    return new Response(
      JSON.stringify(response),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/virtualized/rollback
 * 
 * 获取可用的Checkpoint列表
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await checkpointService.init();
    
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agentId');
    
    // 获取性能指标
    const metrics = checkpointService.getMetrics();
    
    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          totalCheckpoints: metrics.totalCheckpoints,
          byLevel: metrics.byLevel,
          avgSaveTime: metrics.avgSaveTime,
          avgRestoreTime: metrics.avgRestoreTime,
          p99RestoreTime: metrics.p99RestoreTime,
        },
        timestamp: Date.now(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
