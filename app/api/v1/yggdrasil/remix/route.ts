/**
 * YGGDRASIL API - Remix 上下文重生
 * POST /api/v1/yggdrasil/remix
 */

import { NextRequest, NextResponse } from 'next/server';
import { yggdrasil } from '@/lib/yggdrasil';
import { RemixRequest } from '@/lib/yggdrasil/types';

export async function POST(request: NextRequest) {
  try {
    const body: RemixRequest = await request.json();

    // 验证请求
    if (!body.sessionId || !body.workspaceId) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, workspaceId' },
        { status: 400 }
      );
    }

    if (!body.compressionLevel || ![1, 2, 3].includes(body.compressionLevel)) {
      return NextResponse.json(
        { error: 'Invalid compressionLevel. Must be 1, 2, or 3' },
        { status: 400 }
      );
    }

    // 执行Remix
    const result = await yggdrasil.remix(body);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error, 
          action: result.action,
          data: result.data,
        },
        { status: result.data?.savingsRate ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      data: result.data,
      durationMs: result.durationMs,
      timestamp: result.timestamp,
    });

  } catch (error) {
    console.error('[API] Remix error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
