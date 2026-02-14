/**
 * TSA (Tiered Storage Architecture) 监控指标 API
 * 
 * 路由: /api/v1/tsa/metrics
 * 
 * 功能：
 * - GET: 获取 TSA 监控指标
 * - POST: 重置监控指标
 */

import { NextRequest, NextResponse } from 'next/server';
import { tsa, TSAMetrics } from '@/lib/tsa';

export interface MetricsResponse {
  success: boolean;
  data?: TSAMetrics & {
    uptime: number;
    stats: {
      total: number;
      transient: number;
      staging: number;
      archive: number;
    };
  };
  error?: string;
}

/**
 * GET /api/v1/tsa/metrics
 * 获取 TSA 监控指标
 */
export async function GET(request: NextRequest): Promise<NextResponse<MetricsResponse>> {
  try {
    // 获取基础监控指标
    const metrics = tsa.getMetrics();
    
    // 获取监控器实例以获取运行时间
    const monitor = tsa.getMonitor();
    const uptime = monitor.getUptime();
    
    // 获取存储统计
    const stats = tsa.getStats();

    const response: MetricsResponse = {
      success: true,
      data: {
        ...metrics,
        uptime,
        stats,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[TSA Metrics API] Error:', error);
    
    const response: MetricsResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

export interface ResetMetricsRequest {
  confirm?: boolean;
}

export interface ResetMetricsResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * POST /api/v1/tsa/metrics
 * 重置监控指标（需要确认）
 * 
 * 请求体: { confirm: true }
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ResetMetricsResponse>> {
  try {
    const body: ResetMetricsRequest = await request.json();

    // 安全检查：需要显式确认
    if (!body.confirm) {
      const response: ResetMetricsResponse = {
        success: false,
        error: 'Missing confirmation. Set confirm: true to reset metrics.',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // 重置监控指标
    const monitor = tsa.getMonitor();
    monitor.reset();

    const response: ResetMetricsResponse = {
      success: true,
      message: 'Metrics reset successfully',
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[TSA Metrics API] Reset error:', error);
    
    const response: ResetMetricsResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * 配置路由段
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
