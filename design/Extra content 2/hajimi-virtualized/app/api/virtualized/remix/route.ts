/**
 * HAJIMI VIRTUALIZED - API路由: /api/virtualized/remix
 * 
 * 工单 6/6: API层暴露与YGGDRASIL四象限集成
 * 
 * 快捷键绑定: Ctrl+M
 * 调用: Compressor
 * 
 * 参考规范:
 * - ID-78（YGGDRASIL聊天治理四象限）
 * - ID-77（Phase 5人格化UI）
 * 
 * @module api/virtualized/remix
 * @version 1.0.0
 */

import { ContextCompressor } from '../../../../lib/fabric/compressor';

/**
 * Remix请求体
 */
interface RemixRequest {
  /** 原始数据 */
  data: string;
  /** 压缩模式 */
  mode?: 'SPEED' | 'BALANCED' | 'SIZE';
  /** 目标压缩率 */
  targetRatio?: number;
}

/**
 * Remix响应
 */
interface RemixResponse {
  /** 是否成功 */
  success: boolean;
  /** Remix Pattern */
  pattern?: {
    type: string;
    version: string;
    compression: {
      originalSize: number;
      compressedSize: number;
      compressionRatio: number;
      algorithm: string;
      checksum: string;
    };
    preservedKeys: string[];
    discardedDetails: string[];
    hashChain: string[];
    decisionPoints: Array<{
      timestamp: number;
      decision: string;
      reason: string;
    }>;
    debtDeclarations: string[];
    failedTests: string[];
  };
  /** 错误信息 */
  error?: string;
  /** 时间戳 */
  timestamp: number;
}

// 全局压缩器实例
const compressor = new ContextCompressor();

/**
 * POST /api/virtualized/remix
 * 
 * 压缩并生成Remix Pattern
 * 快捷键: Ctrl+M
 * 调用: Compressor
 * 
 * @param request - HTTP请求
 * @returns HTTP响应
 */
export async function POST(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    // 解析请求体
    const body: RemixRequest = await request.json();
    
    // 验证必需参数
    if (!body.data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameter: data',
          timestamp,
        } as RemixResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 配置压缩器（如果指定了目标压缩率）
    let targetCompressor = compressor;
    if (body.targetRatio && body.targetRatio !== 0.8) {
      targetCompressor = new ContextCompressor({
        targetCompressionRatio: body.targetRatio,
        minCompressionRatio: body.targetRatio,
      });
    }

    // 执行Remix压缩
    const mode = body.mode || 'BALANCED';
    const remix = targetCompressor.remix(body.data);

    // 返回成功响应
    const response: RemixResponse = {
      success: true,
      pattern: {
        type: remix.type,
        version: remix.version,
        compression: {
          originalSize: remix.compression.originalSize,
          compressedSize: remix.compression.compressedSize,
          compressionRatio: remix.compression.compressionRatio,
          algorithm: remix.compression.algorithm,
          checksum: remix.compression.checksum,
        },
        preservedKeys: remix.preservedKeys,
        discardedDetails: remix.discardedDetails,
        hashChain: remix.hashChain,
        decisionPoints: remix.decisionPoints,
        debtDeclarations: remix.debtDeclarations,
        failedTests: remix.failedTests,
      },
      timestamp,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // 返回错误响应
    const response: RemixResponse = {
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

/**
 * GET /api/virtualized/remix
 * 
 * 获取压缩器状态和信息
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      success: true,
      info: {
        defaultTargetRatio: 0.8,
        supportedAlgorithms: ['LZ4', 'ZSTD-3', 'ZSTD-9', 'ADAPTIVE'],
        supportedModes: ['SPEED', 'BALANCED', 'SIZE'],
        hashChainLength: compressor.getHashChain().length,
      },
      timestamp: Date.now(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
