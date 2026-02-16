/**
 * HAJIMI VIRTUALIZED - API路由: /api/v1/virtualized/remix
 * 
 * 集成至Hajimi-Code-Ultra v1.2.0
 * 快捷键绑定: Ctrl+M
 * 
 * @version 1.0.0
 */

import { ContextCompressor } from '../../../../../lib/fabric/compressor';

interface RemixRequest {
  data: string;
  mode?: 'SPEED' | 'BALANCED' | 'SIZE';
  targetRatio?: number;
}

interface RemixResponse {
  success: boolean;
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
  error?: string;
  timestamp: number;
}

const compressor = new ContextCompressor();

export async function POST(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    const body: RemixRequest = await request.json();
    
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

    let targetCompressor = compressor;
    if (body.targetRatio && body.targetRatio !== 0.8) {
      targetCompressor = new ContextCompressor({
        targetCompressionRatio: body.targetRatio,
        minCompressionRatio: body.targetRatio,
      });
    }

    const mode = body.mode || 'BALANCED';
    const remix = targetCompressor.remix(body.data);

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
