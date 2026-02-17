/**
 * Alice ONNX 动态量化配置
 * HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP B-04/09
 * 
 * 校准参数接口与量化引擎配置
 * 
 * @module lib/alice/quantization-config
 * @author 唐音 (Engineer)
 * @version 1.0.0
 * 
 * 核心要求:
 * - 动态量化策略：运行时FP32→INT8转换，延迟<5ms
 * - 校准数据来源：使用B-08生成的1000条合成轨迹数据
 * - 精度保障：INT8 vs FP32余弦相似度>0.98（<2%损失）
 * - 回退机制：量化失败（精度损失>5%）自动回退FP32
 * - 内存优化：INT8模型体积压缩至FP32的25%，内存<50MB
 * 
 * 自测标准:
 * - QUANT-ARCH-001: 量化延迟<5ms
 * - QUANT-ARCH-002: 精度损失<2%
 * - QUANT-ARCH-003: 回退机制可靠
 */

import type { NormalizedFeatures, BehaviorClass } from './feature-extractor';

// ============================================================================
// 量化策略配置
// ============================================================================

/**
 * 量化策略类型
 * - dynamic: 动态量化（运行时激活校准）
 * - static: 静态量化（预校准）
 */
export type QuantizationStrategy = 'dynamic' | 'static';

/**
 * 量化方案类型
 * - symmetric: 对称量化 (zero_point = 0)
 * - asymmetric: 非对称量化
 */
export type QuantizationScheme = 'symmetric' | 'asymmetric';

/**
 * 量化粒度
 * - per-tensor: 每整个张量一个scale
 * - per-channel: 每输出通道一个scale
 * - per-token: 每个token一个scale (用于激活)
 */
export type QuantizationGranularity = 'per-tensor' | 'per-channel' | 'per-token';

/**
 * 校准策略
 * - min-max: 使用Min-Max范围
 * - kl: KL散度最小化
 * - percentile: 百分位方法 (默认99.9%)
 */
export type CalibrationStrategy = 'min-max' | 'kl' | 'percentile';

// ============================================================================
// 核心配置接口
// ============================================================================

/**
 * 动态量化配置
 * 
 * 自测: QUANT-ARCH-001 量化延迟<5ms
 * 自测: QUANT-ARCH-002 精度损失<2%
 */
export interface QuantizationConfig {
  /** 量化策略 */
  strategy: QuantizationStrategy;
  
  /** 权重量化方案 */
  weightScheme: QuantizationScheme;
  
  /** 激活量化方案 */
  activationScheme: QuantizationScheme;
  
  /** 权重量化粒度 */
  weightGranularity: QuantizationGranularity;
  
  /** 激活量化粒度 */
  activationGranularity: Exclude<QuantizationGranularity, 'per-channel'>;
  
  /** 余弦相似度阈值 (≥此值接受量化) */
  similarityThreshold: number;
  
  /** 回退阈值 (<此值触发回退FP32) */
  fallbackThreshold: number;
  
  /** 最大量化延迟 (ms) */
  maxLatencyMs: number;
  
  /** 最大运行时内存 (MB) */
  maxMemoryMB: number;
  
  /** 校准样本数量 */
  calibrationSamples: number;
  
  /** 校准策略 */
  calibrationStrategy: CalibrationStrategy;
  
  /** 百分位校准的百分比 (默认0.999) */
  calibrationPercentile?: number;
  
  /** 是否启用自动回退 */
  enableAutoFallback: boolean;
  
  /** 回退后恢复检测频率 (推理次数) */
  recoveryCheckInterval: number;
}

/**
 * 默认量化配置
 * 基于架构设计第8.2节
 */
export const DEFAULT_QUANTIZATION_CONFIG: QuantizationConfig = {
  strategy: 'dynamic',
  weightScheme: 'symmetric',
  activationScheme: 'asymmetric',
  weightGranularity: 'per-channel',
  activationGranularity: 'per-tensor',
  similarityThreshold: 0.98,    // 余弦相似度>0.98接受
  fallbackThreshold: 0.95,      // <0.95回退
  maxLatencyMs: 5,              // 量化延迟<5ms
  maxMemoryMB: 50,              // 内存<50MB
  calibrationSamples: 1000,     // B-08生成1000条
  calibrationStrategy: 'percentile',
  calibrationPercentile: 0.999,
  enableAutoFallback: true,
  recoveryCheckInterval: 10,
};

// ============================================================================
// 校准数据接口
// ============================================================================

/**
 * 单个校准样本
 * 对应B-08生成的合成轨迹特征
 */
export interface CalibrationSample {
  /** 样本唯一ID */
  id: string;
  
  /** 12维归一化特征向量 */
  features: NormalizedFeatures;
  
  /** 期望行为类别 (可选，用于验证) */
  expectedBehavior?: BehaviorClass;
  
  /** 来源轨迹ID */
  trajectoryId: string;
  
  /** 生成时间戳 */
  timestamp: number;
  
  /** 合成参数 (用于追溯) */
  synthesisParams?: {
    /** 行为类型 */
    behaviorType: string;
    /** 噪声级别 */
    noiseLevel: number;
    /** 轨迹长度 */
    trajectoryLength: number;
  };
}

/**
 * 校准数据统计信息
 */
export interface CalibrationStatistics {
  /** 总样本数 */
  totalSamples: number;
  
  /** 每类行为的样本数 */
  behaviorDistribution: Record<BehaviorClass, number>;
  
  /** 各特征的Min-Max统计 */
  featureStats: {
    [featureIndex: number]: {
      min: number;
      max: number;
      mean: number;
      std: number;
    };
  };
  
  /** 数据质量评分 (0-1) */
  qualityScore: number;
  
  /** 生成时间 */
  generatedAt: string;
}

/**
 * 校准数据集
 * B-08合成轨迹数据的标准格式
 */
export interface CalibrationDataset {
  /** 数据格式版本 */
  version: string;
  
  /** 生成时间 */
  generatedAt: string;
  
  /** 数据来源 */
  source: {
    /** 生成器版本 */
    generatorVersion: string;
    /** 工单号 */
    ticketId: string;
    /** 配置哈希 */
    configHash: string;
  };
  
  /** 总样本数 */
  totalSamples: number;
  
  /** 校准样本数组 */
  samples: CalibrationSample[];
  
  /** 统计信息 */
  statistics: CalibrationStatistics;
  
  /** 验证签名 (防篡改) */
  signature?: string;
}

// ============================================================================
// 量化结果接口
// ============================================================================

/**
 * 量化质量指标
 */
export interface QuantizationMetrics {
  /** FP32 vs INT8 余弦相似度 */
  cosineSimilarity: number;
  
  /** Top-1 准确率下降比例 */
  accuracyDrop: number;
  
  /** 量化耗时 (ms) */
  quantizationLatencyMs: number;
  
  /** 推理延迟对比 */
  inferenceLatency: {
    fp32Ms: number;
    int8Ms: number;
    speedup: number;
  };
  
  /** 内存使用对比 (MB) */
  memoryUsage: {
    fp32MB: number;
    int8MB: number;
    compressionRatio: number;
  };
}

/**
 * 量化结果
 */
export interface QuantizationResult {
  /** 是否成功 */
  success: boolean;
  
  /** INT8模型数据 */
  int8Model: Uint8Array;
  
  /** 原始FP32大小 */
  originalSizeBytes: number;
  
  /** 量化后大小 */
  quantizedSizeBytes: number;
  
  /** 压缩比例 */
  compressionRatio: number;
  
  /** 质量指标 */
  metrics: QuantizationMetrics;
  
  /** 是否触发回退 */
  fallbackTriggered: boolean;
  
  /** 错误信息 (如果失败) */
  error?: string;
  
  /** 详细日志 */
  logs: string[];
}

// ============================================================================
// 回退机制接口
// ============================================================================

/**
 * 回退触发原因
 */
export enum FallbackTrigger {
  /** 余弦相似度过低 */
  SIMILARITY_TOO_LOW = 'similarity_too_low',
  
  /** 准确率下降过多 */
  ACCURACY_DROP = 'accuracy_drop',
  
  /** 量化超时 */
  QUANTIZATION_TIMEOUT = 'quantization_timeout',
  
  /** 推理过慢 */
  INFERENCE_SLOW = 'inference_slow',
  
  /** 内存压力 */
  MEMORY_PRESSURE = 'memory_pressure',
  
  /** 运行时错误 */
  RUNTIME_ERROR = 'runtime_error',
  
  /** 手动强制 */
  MANUAL_OVERRIDE = 'manual_override',
}

/**
 * 量化引擎状态
 */
export interface QuantizationStatus {
  /** 当前模式: int8 | fp32 */
  mode: 'int8' | 'fp32';
  
  /** 是否已初始化 */
  initialized: boolean;
  
  /** 是否触发过回退 */
  fallbackTriggered: boolean;
  
  /** 回退触发原因 */
  fallbackReason?: FallbackTrigger;
  
  /** 回退发生时间 */
  fallbackAt?: number;
  
  /** 当前质量指标 */
  currentMetrics?: QuantizationMetrics;
  
  /** 推理计数 */
  inferenceCount: {
    int8: number;
    fp32: number;
  };
  
  /** 上次恢复检查时间 */
  lastRecoveryCheck?: number;
}

// ============================================================================
// 运行时配置接口
// ============================================================================

/**
 * 运行时量化参数 (动态计算)
 */
export interface RuntimeQuantizationParams {
  /** 张量名称 */
  tensorName: string;
  
  /** 缩放因子 */
  scale: number;
  
  /** 零点 (对称量化为0) */
  zeroPoint: number;
  
  /** 量化类型 */
  type: 'weight' | 'activation';
  
  /** 数据类型 */
  dataType: 'int8' | 'uint8';
}

/**
 * 分块计算配置 (内存优化)
 */
export interface TilingConfig {
  /** 是否启用分块 */
  enabled: boolean;
  
  /** 块大小 */
  blockSize: number;
  
  /** 最大并发块数 */
  maxConcurrentBlocks: number;
}

// ============================================================================
// 校准数据生成器接口 (B-08集成)
// ============================================================================

/**
 * B-08 合成轨迹生成器配置
 */
export interface SyntheticTrajectoryConfig {
  /** 目标样本数 */
  targetSamples: number;
  
  /** 每类行为样本数 */
  samplesPerClass: number;
  
  /** 轨迹点数量范围 */
  trajectoryLengthRange: [number, number];
  
  /** 噪声级别范围 */
  noiseLevelRange: [number, number];
  
  /** 输出路径 */
  outputPath: string;
}

/**
 * 校准数据加载器接口
 */
export interface CalibrationDataLoader {
  /** 从B-08生成器加载 */
  loadFromGenerator(config: SyntheticTrajectoryConfig): Promise<CalibrationDataset>;
  
  /** 从存储加载 */
  loadFromStorage(path: string): Promise<CalibrationDataset>;
  
  /** 验证数据完整性 */
  validate(dataset: CalibrationDataset): boolean;
  
  /** 保存到存储 */
  save(dataset: CalibrationDataset, path: string): Promise<void>;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建默认校准数据集 (空)
 */
export function createEmptyCalibrationDataset(): CalibrationDataset {
  const now = new Date().toISOString();
  
  return {
    version: '1.0.0',
    generatedAt: now,
    source: {
      generatorVersion: '0.0.0',
      ticketId: 'B-08',
      configHash: '',
    },
    totalSamples: 0,
    samples: [],
    statistics: {
      totalSamples: 0,
      behaviorDistribution: {
        lost_confused: 0,
        rage_shake: 0,
        precision_snipe: 0,
        urgent_rush: 0,
        casual_explore: 0,
        uncertain: 0,
      },
      featureStats: {},
      qualityScore: 0,
      generatedAt: now,
    },
  };
}

/**
 * 验证量化配置
 */
export function validateQuantizationConfig(
  config: Partial<QuantizationConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // 验证阈值范围
  if (config.similarityThreshold !== undefined) {
    if (config.similarityThreshold < 0 || config.similarityThreshold > 1) {
      errors.push('similarityThreshold must be in [0, 1]');
    }
  }
  
  if (config.fallbackThreshold !== undefined) {
    if (config.fallbackThreshold < 0 || config.fallbackThreshold > 1) {
      errors.push('fallbackThreshold must be in [0, 1]');
    }
  }
  
  // 验证阈值关系
  if (config.similarityThreshold !== undefined && 
      config.fallbackThreshold !== undefined) {
    if (config.similarityThreshold < config.fallbackThreshold) {
      errors.push('similarityThreshold should be >= fallbackThreshold');
    }
  }
  
  // 验证延迟约束
  if (config.maxLatencyMs !== undefined && config.maxLatencyMs <= 0) {
    errors.push('maxLatencyMs must be positive');
  }
  
  // 验证内存约束
  if (config.maxMemoryMB !== undefined && config.maxMemoryMB <= 0) {
    errors.push('maxMemoryMB must be positive');
  }
  
  // 验证校准样本数
  if (config.calibrationSamples !== undefined) {
    if (config.calibrationSamples < 100) {
      errors.push('calibrationSamples should be at least 100');
    }
    if (config.calibrationSamples > 10000) {
      errors.push('calibrationSamples should not exceed 10000');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 合并配置 (深度合并)
 */
export function mergeQuantizationConfig(
  base: QuantizationConfig,
  override: Partial<QuantizationConfig>
): QuantizationConfig {
  return {
    ...base,
    ...override,
  };
}

// ============================================================================
// 常量定义
// ============================================================================

/** INT8 数值范围 */
export const INT8_RANGE = {
  MIN: -128,
  MAX: 127,
} as const;

/** UINT8 数值范围 */
export const UINT8_RANGE = {
  MIN: 0,
  MAX: 255,
} as const;

/** 默认校准数据存储路径 */
export const DEFAULT_CALIBRATION_PATH = 'storage/quantized/calibration-data.json';

/** 量化引擎版本 */
export const QUANTIZATION_ENGINE_VERSION = '1.0.0';

// ============================================================================
// 导出
// ============================================================================

export default {
  DEFAULT_QUANTIZATION_CONFIG,
  INT8_RANGE,
  UINT8_RANGE,
  DEFAULT_CALIBRATION_PATH,
  QUANTIZATION_ENGINE_VERSION,
  createEmptyCalibrationDataset,
  validateQuantizationConfig,
  mergeQuantizationConfig,
};
