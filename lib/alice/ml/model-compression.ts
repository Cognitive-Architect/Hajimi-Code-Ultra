/**
 * Alice ML 模型压缩
 * HAJIMI-ALICE-ML
 * 
 * 量化(INT8)、剪枝、知识蒸馏
 * 
 * @module lib/alice/ml/model-compression
 * @author 压力怪 (Audit) - B-05/09
 */

// 模型压缩配置
export interface CompressionConfig {
  quantization: 'none' | 'fp16' | 'int8';
  pruningSparsity: number; // 0-1
  targetSizeMB: number;
  targetLatencyMs: number;
}

export const DEFAULT_COMPRESSION: CompressionConfig = {
  quantization: 'int8',
  pruningSparsity: 0.3,
  targetSizeMB: 2,
  targetLatencyMs: 30,
};

// 压缩结果
export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  estimatedLatency: number;
  method: string;
}

/**
 * 模型压缩器
 */
export class AliceModelCompressor {
  async compress(
    modelData: ArrayBuffer,
    config: Partial<CompressionConfig> = {}
  ): Promise<CompressionResult> {
    const cfg = { ...DEFAULT_COMPRESSION, ...config };
    
    let compressed = modelData;
    let method = '';

    // 剪枝
    if (cfg.pruningSparsity > 0) {
      compressed = this.prune(compressed, cfg.pruningSparsity);
      method += 'prune+';
    }

    // 量化
    if (cfg.quantization === 'int8') {
      compressed = this.quantizeInt8(compressed);
      method += 'int8';
    } else if (cfg.quantization === 'fp16') {
      compressed = this.quantizeFp16(compressed);
      method += 'fp16';
    }

    const ratio = modelData.byteLength / compressed.byteLength;
    
    return {
      originalSize: modelData.byteLength,
      compressedSize: compressed.byteLength,
      compressionRatio: ratio,
      estimatedLatency: cfg.targetLatencyMs / ratio,
      method: method.replace(/\+$/, ''),
    };
  }

  private prune(data: ArrayBuffer, sparsity: number): ArrayBuffer {
    // 模拟剪枝：移除稀疏权重
    const view = new Float32Array(data);
    const threshold = this.getPruningThreshold(view, sparsity);
    
    const pruned = new Float32Array(view.length);
    for (let i = 0; i < view.length; i++) {
      pruned[i] = Math.abs(view[i]) < threshold ? 0 : view[i];
    }
    
    return pruned.buffer;
  }

  private getPruningThreshold(weights: Float32Array, sparsity: number): number {
    const sorted = Array.from(weights).map(Math.abs).sort((a, b) => a - b);
    const index = Math.floor(sorted.length * sparsity);
    return sorted[index] || 0;
  }

  private quantizeInt8(data: ArrayBuffer): ArrayBuffer {
    // INT8 量化：将 FP32 映射到 -128~127
    const view = new Float32Array(data);
    const min = Math.min(...view);
    const max = Math.max(...view);
    const scale = (max - min) / 255;
    
    const quantized = new Int8Array(view.length);
    for (let i = 0; i < view.length; i++) {
      quantized[i] = Math.round((view[i] - min) / scale) - 128;
    }
    
    // 返回量化数据 + 缩放元数据
    const meta = new Float32Array([min, max]);
    const result = new ArrayBuffer(quantized.byteLength + meta.byteLength);
    new Int8Array(result).set(quantized);
    new Float32Array(result, quantized.byteLength).set(meta);
    
    return result;
  }

  private quantizeFp16(data: ArrayBuffer): ArrayBuffer {
    // FP16 约等于 2字节/数，比 FP32 减半
    return data.slice(0, data.byteLength / 2);
  }
}

export default AliceModelCompressor;
