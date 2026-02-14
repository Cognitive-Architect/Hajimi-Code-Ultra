import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';
import { handleAPIError } from '@/lib/api/error-handler';

/**
 * GET /api/v1/state/current
 * 获取当前状态和历史记录
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // 确保状态机已初始化
    await stateMachine.init();

    // 获取状态响应
    const response = stateMachine.getStateResponse();

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[API] 获取状态失败:', error);
    return handleAPIError(error);
  }
}
