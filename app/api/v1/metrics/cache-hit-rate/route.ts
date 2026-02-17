/**
 * 缓存命中率监控 API
 * 
 * 路由: /api/v1/metrics/cache-hit-rate
 * 
 * 功能：
 * - GET: 获取缓存命中率指标
 * - POST: 手动触发缓存失效或重置指标
 * 
 * 自测：
 * - CACHE-001: 命中率>25%
 * - CACHE-002: P95降低>10ms
 * - CACHE-003: 内存<50MB
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getQueryCache, 
  QueryCache, 
  CacheMetrics,
  TARGET_HIT_RATE,
  MAX_MEMORY_BUDGET_BYTES,
} from '@/lib/lcr/cache/query-cache';

// ============================================================================
// 响应类型定义
// ============================================================================

/**
 * 缓存命中率响应
 */
export interface CacheHitRateResponse {
  success: boolean;
  data?: {
    /** 命中率 (0-1) */
    hitRate: number;
    /** 命中次数 */
    hits: number;
    /** 未命中次数 */
    misses: number;
    /** 总访问次数 */
    total: number;
    /** 当前缓存条目数 */
    size: number;
    /** 缓存容量 */
    capacity: number;
    /** 当前内存使用 (字节) */
    memoryUsage: number;
    /** 内存预算 (字节) */
    memoryBudget: number;
    /** 内存使用率 (0-1) */
    memoryUtilization: number;
    /** 淘汰次数 */
    evictions: number;
    /** TTL过期次数 */
    ttlExpirations: number;
    /** 平均条目大小 (字节) */
    avgEntrySize: number;
    /** 健康状态 */
    health: {
      /** 是否健康 */
      healthy: boolean;
      /** 命中率检查 */
      hitRateOk: boolean;
      /** 内存检查 */
      memoryOk: boolean;
      /** 状态描述 */
      status: 'healthy' | 'degraded' | 'critical';
    };
  };
  error?: string;
}

/**
 * 缓存失效请求
 */
export interface CacheInvalidateRequest {
  /** 匹配模式 (正则表达式)，为空则清空全部 */
  pattern?: string;
  /** 确认执行 */
  confirm?: boolean;
}

/**
 * 缓存失效响应
 */
export interface CacheInvalidateResponse {
  success: boolean;
  message?: string;
  error?: string;
  /** 失效的条目数 */
  invalidatedCount?: number;
}

/**
 * 缓存重置请求
 */
export interface CacheResetRequest {
  /** 确认重置 */
  confirm: boolean;
}

/**
 * 缓存重置响应
 */
export interface CacheResetResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// GET /api/v1/metrics/cache-hit-rate
// ============================================================================

/**
 * 获取缓存命中率指标
 * 
 * 返回当前缓存的各项指标，包括命中率、内存使用等
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<CacheHitRateResponse>> {
  try {
    const cache = getQueryCache();
    const metrics = cache.getMetrics();

    const response: CacheHitRateResponse = {
      success: true,
      data: buildMetricsResponse(metrics),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[Cache Metrics API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * 构建指标响应
 */
function buildMetricsResponse(metrics: CacheMetrics): CacheHitRateResponse['data'] {
  const hitRateOk = metrics.hitRate >= TARGET_HIT_RATE;
  const memoryOk = metrics.memoryUsage < MAX_MEMORY_BUDGET_BYTES;
  
  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (!hitRateOk && !memoryOk) {
    status = 'critical';
  } else if (!hitRateOk || !memoryOk) {
    status = 'degraded';
  }

  return {
    hitRate: metrics.hitRate,
    hits: metrics.hits,
    misses: metrics.misses,
    total: metrics.total,
    size: metrics.size,
    capacity: DEFAULT_CACHE_CAPACITY,
    memoryUsage: metrics.memoryUsage,
    memoryBudget: MAX_MEMORY_BUDGET_BYTES,
    memoryUtilization: metrics.memoryUsage / MAX_MEMORY_BUDGET_BYTES,
    evictions: metrics.evictions,
    ttlExpirations: metrics.ttlExpirations,
    avgEntrySize: metrics.avgEntrySize,
    health: {
      healthy: hitRateOk && memoryOk,
      hitRateOk,
      memoryOk,
      status,
    },
  };
}

// ============================================================================
// POST /api/v1/metrics/cache-hit-rate
// ============================================================================

/**
 * 执行缓存管理操作
 * 
 * 支持的操作：
 * - 使缓存失效 (通过 pattern 参数)
 * - 重置缓存 (通过 confirm: true)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CacheInvalidateResponse | CacheResetResponse>> {
  try {
    const body = await request.json();
    const cache = getQueryCache();

    // 处理重置请求
    if ('confirm' in body && !('pattern' in body)) {
      return handleReset(body as CacheResetRequest, cache);
    }

    // 处理失效请求
    return handleInvalidate(body as CacheInvalidateRequest, cache);
  } catch (error) {
    console.error('[Cache Metrics API] POST Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * 处理缓存重置
 */
function handleReset(
  body: CacheResetRequest,
  cache: QueryCache
): NextResponse<CacheResetResponse> {
  if (!body.confirm) {
    return NextResponse.json(
      {
        success: false,
        error: 'Missing confirmation. Set confirm: true to reset cache.',
      },
      { status: 400 }
    );
  }

  const beforeSize = cache.size;
  cache.clear();

  return NextResponse.json(
    {
      success: true,
      message: `Cache reset successfully. Cleared ${beforeSize} entries.`,
    },
    { status: 200 }
    );
}

/**
 * 处理缓存失效
 */
function handleInvalidate(
  body: CacheInvalidateRequest,
  cache: QueryCache
): NextResponse<CacheInvalidateResponse> {
  if (!body.confirm) {
    return NextResponse.json(
      {
        success: false,
        error: 'Missing confirmation. Set confirm: true to invalidate cache.',
      },
      { status: 400 }
    );
  }

  const beforeSize = cache.size;
  
  try {
    cache.invalidate(body.pattern);
    const afterSize = cache.size;
    const invalidatedCount = beforeSize - afterSize;

    return NextResponse.json(
      {
        success: true,
        message: body.pattern
          ? `Invalidated ${invalidatedCount} entries matching pattern: ${body.pattern}`
          : `All ${invalidatedCount} entries invalidated successfully`,
        invalidatedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 400 }
    );
  }
}

// ============================================================================
// DELETE /api/v1/metrics/cache-hit-rate
// ============================================================================

/**
 * 清空全部缓存 (RESTful风格)
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<CacheResetResponse>> {
  try {
    const cache = getQueryCache();
    const beforeSize = cache.size;
    
    cache.clear();

    return NextResponse.json(
      {
        success: true,
        message: `Cache cleared successfully. Removed ${beforeSize} entries.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Cache Metrics API] DELETE Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// 常量定义
// ============================================================================

/** 默认缓存容量 */
const DEFAULT_CACHE_CAPACITY = 1000;

// ============================================================================
// 路由配置
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
