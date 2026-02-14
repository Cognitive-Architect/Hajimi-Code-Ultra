import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';
import { handleAPIError } from '@/lib/api/error-handler';

/**
 * POST /api/v1/state/reset
 * 重置状态机（仅用于测试）
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    await stateMachine.reset();
    
    return NextResponse.json({
      success: true,
      message: 'State machine reset successfully',
      state: stateMachine.getCurrentState(),
      timestamp: Date.now(),
    }, { status: 200 });
  } catch (error) {
    console.error('[API] 重置状态机失败:', error);
    return handleAPIError(error);
  }
}
