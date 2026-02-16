/**
 * YGGDRASIL API - Regenerate 状态重置
 * POST /api/v1/yggdrasil/regenerate
 */

import { NextRequest, NextResponse } from 'next/server';
import { yggdrasil } from '@/lib/yggdrasil';
import { RegenerateRequest } from '@/lib/yggdrasil/types';

export async function POST(request: NextRequest) {
  try {
    const body: RegenerateRequest = await request.json();

    // 验证请求
    if (!body.sessionId) {
      return NextResponse.json(
        { error: 'Missing required field: sessionId' },
        { status: 400 }
      );
    }

    // 执行Regenerate
    const result = await yggdrasil.regenerate(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, action: result.action },
        { status: 500 }
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
    console.error('[API] Regenerate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
