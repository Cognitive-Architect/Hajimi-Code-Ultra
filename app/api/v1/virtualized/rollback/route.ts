/**
 * HAJIMI VIRTUALIZED - API路由: /api/v1/virtualized/rollback
 * 
 * 集成至Hajimi-Code-Ultra v1.2.0
 * 快捷键绑定: Ctrl+Z
 * 
 * @version 1.0.0
 */

import { CheckpointService } from '../../../../../lib/virtualized/checkpoint';

interface RollbackRequest {
  checkpointId?: string;
  level?: 'L0' | 'L1' | 'L2' | 'L3';
  agentId?: string;
  reason?: string;
}

interface RollbackResponse {
  success: boolean;
  checkpointId?: string;
  agentId?: string;
  restoreTime?: number;
  error?: string;
  timestamp: number;
}

const checkpointService = new CheckpointService();

export async function POST(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    await checkpointService.init();
    
    const body: RollbackRequest = await request.json();
    
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
        restoreTime: 0,
      };
    } else if (body.checkpointId) {
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

export async function GET(request: Request): Promise<Response> {
  try {
    await checkpointService.init();
    
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
