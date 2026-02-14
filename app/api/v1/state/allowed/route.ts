import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';
import { AgentRole } from '@/lib/types/state';
import { handleAPIError } from '@/lib/api/error-handler';

/**
 * GET /api/v1/state/allowed?agent={role}
 * 获取当前状态下允许的流转目标
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 获取查询参数
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent') as AgentRole | undefined;

    // 2. 确保状态机已初始化
    await stateMachine.init();

    // 3. 获取允许的流转
    const allowedTransitions = stateMachine.getAllowedTransitions(agent);
    const currentState = stateMachine.getCurrentState();

    return NextResponse.json({
      currentState,
      allowedTransitions,
      agent,
      timestamp: Date.now(),
    }, { status: 200 });
  } catch (error) {
    console.error('[API] 获取允许流转失败:', error);
    return handleAPIError(error);
  }
}
