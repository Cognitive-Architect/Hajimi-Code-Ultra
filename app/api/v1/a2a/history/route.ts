/**
 * A2A Message History API Route
 * 
 * GET /api/v1/a2a/history?sessionId=xxx&page=1&pageSize=20&order=desc
 * 获取A2A消息历史
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { a2aService } from '@/lib/core/agents/a2a-service';
import { handleAPIError } from '@/lib/api/error-handler';

/**
 * 查询参数验证Schema
 */
const HistoryQuerySchema = z.object({
  sessionId: z.string().min(1, '会话ID不能为空'),
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).optional(),
  order: z.enum(['asc', 'desc'] as const).optional(),
});

type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

/**
 * GET /api/v1/a2a/history
 * 获取A2A消息历史
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析查询参数
    const { searchParams } = new URL(request.url);
    const queryParams = {
      sessionId: searchParams.get('sessionId') ?? '',
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      order: (searchParams.get('order') as 'asc' | 'desc') ?? undefined,
    };

    // 2. 验证查询参数
    const validation = HistoryQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: '查询参数验证失败',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { sessionId, page, pageSize, order } = validation.data;

    // 3. 确保服务已初始化
    await a2aService.init();

    // 4. 获取消息历史
    const result = await a2aService.getHistory(sessionId, {
      page,
      pageSize,
      order,
    });

    // 5. 返回结果
    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] 获取A2A消息历史失败:', error);
    return handleAPIError(error);
  }
}

/**
 * POST /api/v1/a2a/history
 * 批量获取A2A消息历史（支持复杂查询）
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析请求体
    const body = await request.json();

    // 2. 验证请求体
    const PostQuerySchema = z.object({
      sessionId: z.string().min(1, '会话ID不能为空'),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional(),
      order: z.enum(['asc', 'desc'] as const).optional(),
      sender: z.string().optional(),
      type: z.enum(['chat', 'proposal', 'vote', 'system'] as const).optional(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
    });

    const validation = PostQuerySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { sessionId, page, pageSize, order, sender, type, startTime, endTime } = validation.data;

    // 3. 确保服务已初始化
    await a2aService.init();

    // 4. 获取消息历史
    const result = await a2aService.getHistory(sessionId, {
      page,
      pageSize,
      order,
    });

    // 5. 过滤结果（客户端过滤，简化实现）
    let filteredData = result.data;
    
    if (sender) {
      filteredData = filteredData.filter(msg => msg.sender === sender);
    }
    
    if (type) {
      filteredData = filteredData.filter(msg => msg.type === type);
    }
    
    if (startTime) {
      filteredData = filteredData.filter(msg => msg.timestamp >= startTime);
    }
    
    if (endTime) {
      filteredData = filteredData.filter(msg => msg.timestamp <= endTime);
    }

    // 6. 返回结果
    return NextResponse.json(
      {
        success: true,
        data: filteredData,
        pagination: {
          ...result.pagination,
          total: filteredData.length,
          totalPages: Math.ceil(filteredData.length / (pageSize ?? 20)),
          hasNext: false, // 简化处理
          hasPrev: (page ?? 1) > 1,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] 获取A2A消息历史失败:', error);
    return handleAPIError(error);
  }
}
