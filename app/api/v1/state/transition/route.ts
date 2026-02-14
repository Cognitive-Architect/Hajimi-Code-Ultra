import { NextRequest, NextResponse } from 'next/server';
import { stateMachine } from '@/lib/core/state/machine';
import { PowerState, AgentRole } from '@/lib/types/state';
import { z } from 'zod';
import { handleAPIError } from '@/lib/api/error-handler';

/**
 * 请求体验证Schema
 */
const TransitionRequestSchema = z.object({
  to: z.enum(['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE']),
  agent: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']).optional(),
  reason: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

type TransitionRequest = z.infer<typeof TransitionRequestSchema>;

/**
 * POST /api/v1/state/transition
 * 执行状态流转
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析请求体
    const body = await request.json();

    // 2. 验证请求体
    const validation = TransitionRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'VALIDATION_ERROR', 
          message: 'Invalid request body',
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }

    const { to, agent = 'system', reason, context } = validation.data;

    // 3. 确保状态机已初始化
    await stateMachine.init();

    // 4. 执行流转
    const result = await stateMachine.transition(to, agent, {
      reason,
      ...context,
    });

    // 5. 返回结果
    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(
        { 
          error: 'TRANSITION_REJECTED', 
          message: result.error,
          from: result.from,
          to: result.to,
        },
        { status: 403 }
      );
    }
  } catch (error) {
    console.error('[API] 状态流转失败:', error);
    return handleAPIError(error);
  }
}
