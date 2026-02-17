/**
 * Alice ML 特征提取器 (实体化版本)
 * HAJIMI-LCR-ENTITY-001 - B-06/09
 * 
 * 12维特征向量完整提取 + 归一化 → ONNX Runtime 输入格式
 * 
 * @module lib/alice/feature-extractor
 * @author 唐音 (Engineer)
 * @debt ENTITY-ALICE-002 - P2 - 模型权重随机初始化 (当前使用Mock权重)
 * 
 * 自测项:
 * - ML-002: 12维特征完整性
 * - ML-004: 归一化边界 [0,1]
 * - ML-006: 推理延迟 <25ms (特征提取部分 <16ms)
 */

import type { TrajectoryPoint, CollectedSession, BehaviorLabel } from './ml/data-collector';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 12维特征向量定义
 * 严格遵循 HAJIMI-LCR-TRIPLE 第3.2节（12维特征）
 * 
 * 维度分配:
 * - 速度特征 (3维): velocity_avg, velocity_max, velocity_std
 * - 加速度特征 (2维): acceleration_avg, acceleration_max  
 * - 曲率特征 (2维): curvature_avg, curvature_max
 * - Jerk特征 (1维): jerk_avg (加速度变化率)
 * - 角度变化 (1维): angle_change_rate
 * - 复杂度特征 (2维): entropy, straightness
 * - 频域特征 (1维): fft_dominant_freq (综合频域能量)
 */
export interface FeatureVector {
  // 速度特征 (3维) - 归一化范围 [0, 2000] px/s
  velocity_avg: number;
  velocity_max: number;
  velocity_std: number;
  
  // 加速度特征 (2维) - 归一化范围 [0, 50000] px/s²
  acceleration_avg: number;
  acceleration_max: number;
  
  // 曲率特征 (2维) - 归一化范围 [0, 0.1] 1/px
  curvature_avg: number;
  curvature_max: number;
  
  // Jerk特征 (1维) - 加速度变化率 [0, 1000000] px/s³
  jerk_avg: number;
  
  // 角度变化特征 (1维) - 归一化范围 [0, π] rad
  angle_change_rate: number;
  
  // 复杂度特征 (2维)
  entropy: number;       // 方向熵 [0, 3]
  straightness: number; // 直线度 [0, 1]
  
  // 频域特征 (1维)
  fft_dominant_freq: number; // 主导频率 [0, 30] Hz
}

/**
 * 归一化后的12维特征向量 (Float32Array 用于 ONNX Runtime)
 * [v_avg, v_max, v_std, a_avg, a_max, c_avg, c_max, jerk, angle, entropy, straight, fft_freq]
 * 
 * 自测: ML-002 12维完整性验证
 */
export type NormalizedFeatures = [
  number, number, number,  // velocity (0-2)
  number, number,          // acceleration (3-4)
  number, number,          // curvature (5-6)
  number,                  // jerk (7)
  number,                  // angle (8)
  number, number,          // complexity (9-10)
  number,                  // frequency (11)
];

/**
 * ONNX Runtime 输入张量格式
 */
export interface OnnxInput {
  data: Float32Array;
  dims: number[];
  type: 'float32';
}

/**
 * 滑动窗口配置
 */
export interface SlidingWindowConfig {
  windowSize: number;
  stride: number;
  aggregation: 'mean' | 'max' | 'last';
}

/**
 * 推理结果
 */
export interface InferenceResult {
  predictions: number[];
  confidence: number;
  latencyMs: number;
  className: BehaviorClass;
  classIndex: number;
}

// 6类行为标签 (与 data-collector.ts 中 BehaviorLabel 对应)
export const BEHAVIOR_CLASSES: BehaviorClass[] = [
  'lost_confused',
  'rage_shake',
  'precision_snipe',
  'urgent_rush',
  'casual_explore',
  'uncertain',
];

export type BehaviorClass = 
  | 'lost_confused'
  | 'rage_shake' 
  | 'precision_snipe'
  | 'urgent_rush'
  | 'casual_explore'
  | 'uncertain';

// ============================================================================
// 归一化参数 (来自训练数据统计 - Min-Max标准化)
// ============================================================================

/**
 * Min-Max标准化参数
 * 公式: normalized = (value - min) / (max - min)
 * 自测: ML-004 归一化边界验证
 */
export const NORMALIZATION_PARAMS = {
  velocity: { min: 0, max: 2000 },           // px/s
  acceleration: { min: 0, max: 50000 },      // px/s²
  curvature: { min: 0, max: 0.1 },           // 1/px
  jerk: { min: 0, max: 1000000 },            // px/s³
  angle: { min: 0, max: Math.PI },           // rad
  entropy: { min: 0, max: 3 },
  fft_freq: { min: 0, max: 30 },             // Hz
} as const;

// ============================================================================
// Alice 特征提取器
// ============================================================================

export class AliceFeatureExtractor {
  private windowConfig: SlidingWindowConfig;
  private featureHistory: NormalizedFeatures[] = [];
  private maxHistorySize = 100;

  constructor(config?: Partial<SlidingWindowConfig>) {
    this.windowConfig = {
      windowSize: 10,
      stride: 5,
      aggregation: 'mean',
      ...config,
    };
  }

  /**
   * 从轨迹点提取完整12维特征向量
   * 
   * 实现要求:
   * 1. 12维特征完整提取（velocity/acceleration/curvature/jerk等）
   * 2. 归一化到[0,1]范围（Min-Max标准化）
   * 
   * 自测: ML-002 12维完整性
   * 自测: ML-004 归一化边界 [0,1]
   * 自测: ML-006 推理延迟<25ms (特征提取部分 <16ms)
   */
  extract(points: TrajectoryPoint[]): NormalizedFeatures {
    const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
    
    // 至少需要4个点来计算jerk (速度→加速度→jerk需要3阶差分)
    if (points.length < 4) {
      return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    // 计算中间特征
    const velocities = this.calculateVelocities(points);
    const accelerations = this.calculateAccelerations(velocities.values, velocities.timestamps);
    const jerks = this.calculateJerks(accelerations.values, accelerations.timestamps);
    const curvatures = this.calculateCurvatures(points);
    const angles = this.calculateAngleChanges(points);
    
    // 组装特征
    const features: FeatureVector = {
      velocity_avg: velocities.avg,
      velocity_max: velocities.max,
      velocity_std: velocities.std,
      
      acceleration_avg: accelerations.avg,
      acceleration_max: accelerations.max,
      
      curvature_avg: curvatures.avg,
      curvature_max: curvatures.max,
      
      jerk_avg: jerks.avg,
      
      angle_change_rate: angles.rate,
      
      entropy: this.calculateEntropy(points),
      straightness: this.calculateStraightness(points),
      
      fft_dominant_freq: 0,
    };

    // 计算频域特征 (需要至少32个点)
    if (points.length >= 32) {
      const fft = this.calculateFFT(points);
      features.fft_dominant_freq = fft.dominantFreq;
    }

    const normalized = this.normalize(features);
    
    // 性能监控
    if (typeof performance !== 'undefined') {
      const duration = performance.now() - startTime;
      if (duration > 16) {
        console.warn(`[ALICE-ML] Feature extraction slow: ${duration.toFixed(2)}ms`);
      }
    }

    // 保存到历史
    this.addToHistory(normalized);

    return normalized;
  }

  /**
   * 从会话提取特征
   */
  extractFromSession(session: CollectedSession): NormalizedFeatures {
    return this.extract(session.points);
  }

  /**
   * 滑动窗口特征聚合
   * 生成用于 ONNX Runtime 的批量输入
   */
  extractWithSlidingWindow(
    points: TrajectoryPoint[],
    customConfig?: Partial<SlidingWindowConfig>
  ): OnnxInput {
    const config = { ...this.windowConfig, ...customConfig };
    const windows: NormalizedFeatures[] = [];

    // 生成滑动窗口
    for (let i = 0; i <= points.length - config.windowSize; i += config.stride) {
      const windowPoints = points.slice(i, i + config.windowSize);
      const features = this.extract(windowPoints);
      windows.push(features);
    }

    // 如果窗口不足，用最后一个填充
    while (windows.length < config.windowSize && windows.length > 0) {
      windows.push(windows[windows.length - 1]);
    }

    // 展平为 Float32Array
    const flattened = windows.flat();
    const data = new Float32Array(flattened);

    return {
      data,
      dims: [windows.length, 12],
      type: 'float32',
    };
  }

  /**
   * 转换为 ONNX Runtime 输入格式
   * 支持单一样本或批量输入
   */
  toOnnxInput(
    features: NormalizedFeatures | NormalizedFeatures[],
    batchSize = 1
  ): OnnxInput {
    const isBatch = Array.isArray(features[0]);
    const featureArrays = isBatch 
      ? features as NormalizedFeatures[]
      : [features as NormalizedFeatures];

    // 确保批次大小
    while (featureArrays.length < batchSize) {
      featureArrays.push(featureArrays[featureArrays.length - 1]);
    }

    const flattened = featureArrays.flat();
    const data = new Float32Array(flattened);

    return {
      data,
      dims: [featureArrays.length, 12],
      type: 'float32',
    };
  }

  /**
   * 聚合多个特征向量
   */
  aggregateFeatures(
    features: NormalizedFeatures[],
    method: 'mean' | 'max' | 'std' = 'mean'
  ): NormalizedFeatures {
    if (features.length === 0) {
      return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (features.length === 1) {
      return features[0];
    }

    const result = new Array(12).fill(0) as NormalizedFeatures;

    for (let i = 0; i < 12; i++) {
      const values = features.map(f => f[i]);
      
      switch (method) {
        case 'mean':
          result[i] = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'max':
          result[i] = Math.max(...values);
          break;
        case 'std':
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          result[i] = Math.sqrt(
            values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
          );
          break;
      }
    }

    return result;
  }

  /**
   * 获取历史特征
   */
  getFeatureHistory(): NormalizedFeatures[] {
    return [...this.featureHistory];
  }

  /**
   * 清空历史
   */
  clearHistory(): void {
    this.featureHistory = [];
  }

  // ========================================================================
  // 核心计算 - 速度特征 (3维)
  // ========================================================================

  private calculateVelocities(points: TrajectoryPoint[]): { 
    timestamps: number[];
    values: number[];
    avg: number; 
    max: number; 
    std: number;
  } {
    const velocities: number[] = [];
    const timestamps: number[] = [];
    
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dt = p1.t - p0.t;
      
      if (dt <= 0) continue;
      
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const v = dist / dt * 1000; // px/s
      
      velocities.push(v);
      timestamps.push(p1.t);
    }
    
    if (velocities.length === 0) {
      return { timestamps: [], values: [0], avg: 0, max: 0, std: 0 };
    }

    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const max = Math.max(...velocities);
    const variance = velocities.reduce((sum, v) => sum + (v - avg) ** 2, 0) / velocities.length;
    const std = Math.sqrt(variance);

    return { timestamps, values: velocities, avg, max, std };
  }

  // ========================================================================
  // 核心计算 - 加速度特征 (2维)
  // ========================================================================

  private calculateAccelerations(
    velocities: number[],
    timestamps: number[]
  ): { 
    timestamps: number[];
    values: number[];
    avg: number; 
    max: number;
  } {
    const accelerations: number[] = [];
    const accelTimestamps: number[] = [];
    
    for (let i = 1; i < velocities.length && i < timestamps.length; i++) {
      const dv = velocities[i] - velocities[i - 1];
      const dt = timestamps[i] - timestamps[i - 1];
      
      if (dt > 0) {
        const a = Math.abs(dv / dt * 1000); // px/s²
        accelerations.push(a);
        accelTimestamps.push(timestamps[i]);
      }
    }
    
    if (accelerations.length === 0) {
      return { timestamps: [], values: [0], avg: 0, max: 0 };
    }

    return {
      timestamps: accelTimestamps,
      values: accelerations,
      avg: accelerations.reduce((a, b) => a + b, 0) / accelerations.length,
      max: Math.max(...accelerations),
    };
  }

  // ========================================================================
  // 核心计算 - Jerk特征 (1维) - 加速度变化率
  // ========================================================================

  private calculateJerks(
    accelerations: number[],
    timestamps: number[]
  ): { 
    avg: number;
    values: number[];
  } {
    const jerks: number[] = [];
    
    for (let i = 1; i < accelerations.length && i < timestamps.length; i++) {
      const da = accelerations[i] - accelerations[i - 1];
      const dt = timestamps[i] - timestamps[i - 1];
      
      if (dt > 0) {
        const j = Math.abs(da / dt * 1000); // px/s³
        jerks.push(j);
      }
    }
    
    if (jerks.length === 0) {
      return { avg: 0, values: [0] };
    }

    return {
      avg: jerks.reduce((a, b) => a + b, 0) / jerks.length,
      values: jerks,
    };
  }

  // ========================================================================
  // 核心计算 - 曲率特征 (2维)
  // ========================================================================

  private calculateCurvatures(points: TrajectoryPoint[]): { 
    avg: number; 
    max: number;
    values: number[];
  } {
    const curvatures: number[] = [];
    
    for (let i = 2; i < points.length; i++) {
      const p0 = points[i - 2];
      const p1 = points[i - 1];
      const p2 = points[i];
      
      const curvature = this.computeCurvature(p0, p1, p2);
      curvatures.push(curvature);
    }
    
    if (curvatures.length === 0) {
      return { avg: 0, max: 0, values: [0] };
    }

    return {
      avg: curvatures.reduce((a, b) => a + b, 0) / curvatures.length,
      max: Math.max(...curvatures),
      values: curvatures,
    };
  }

  private computeCurvature(
    p0: TrajectoryPoint, 
    p1: TrajectoryPoint, 
    p2: TrajectoryPoint
  ): number {
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;
    
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    
    if (dist1 * dist2 < 0.001) return 0;
    
    // 曲率 = |cross| / (|v1| * |v2|)
    return cross / (dist1 * dist2);
  }

  // ========================================================================
  // 核心计算 - 角度变化特征 (1维)
  // ========================================================================

  private calculateAngleChanges(points: TrajectoryPoint[]): { rate: number; values: number[] } {
    const changes: number[] = [];
    
    for (let i = 2; i < points.length; i++) {
      const p0 = points[i - 2];
      const p1 = points[i - 1];
      const p2 = points[i];
      
      const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const angle2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      
      let diff = Math.abs(angle2 - angle1);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      
      changes.push(diff);
    }
    
    return {
      rate: changes.length > 0 
        ? changes.reduce((a, b) => a + b, 0) / points.length 
        : 0,
      values: changes,
    };
  }

  // ========================================================================
  // 核心计算 - 复杂度特征 (2维)
  // ========================================================================

  /**
   * 计算轨迹熵 (方向随机性)
   * 8个方向区间的香农熵
   */
  private calculateEntropy(points: TrajectoryPoint[]): number {
    if (points.length < 4) return 0;
    
    // 8个方向区间
    const bins = new Array(8).fill(0);
    
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const angle = Math.atan2(dy, dx);
      const bin = Math.floor((angle + Math.PI) / (2 * Math.PI) * 8) % 8;
      bins[bin]++;
    }
    
    const total = bins.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    
    let entropy = 0;
    for (const count of bins) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }
    
    return Math.min(entropy, 3); // 限制最大值
  }

  /**
   * 计算直线度 (端点距离 / 路径长度)
   * 值越接近1表示越直
   */
  private calculateStraightness(points: TrajectoryPoint[]): number {
    if (points.length < 2) return 1;
    
    const start = points[0];
    const end = points[points.length - 1];
    const straightDist = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      pathLength += Math.sqrt(dx * dx + dy * dy);
    }
    
    if (pathLength < 0.001) return 1;
    return Math.min(1, straightDist / pathLength);
  }

  // ========================================================================
  // 核心计算 - 频域特征 (1维)
  // ========================================================================

  /**
   * 计算FFT特征 - 使用零穿越率估计主导频率
   */
  private calculateFFT(points: TrajectoryPoint[]): { dominantFreq: number; energy: number } {
    // 使用速度序列的零穿越率估计主导频率
    const velocities: number[] = [];
    
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dt = p1.t - p0.t;
      if (dt <= 0) continue;
      
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      velocities.push(Math.sqrt(dx * dx + dy * dy) / dt * 1000);
    }
    
    if (velocities.length < 4) return { dominantFreq: 0, energy: 0 };
    
    // 零穿越率估计频率
    let zeroCrossings = 0;
    const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    
    for (let i = 1; i < velocities.length; i++) {
      if ((velocities[i - 1] - mean) * (velocities[i] - mean) < 0) {
        zeroCrossings++;
      }
    }
    
    const duration = (points[points.length - 1].t - points[0].t) / 1000;
    const freq = duration > 0 ? zeroCrossings / 2 / duration : 0;
    const energy = velocities.reduce((sum, v) => sum + (v - mean) ** 2, 0) / velocities.length;
    
    return {
      dominantFreq: Math.min(freq, 30),
      energy: Math.min(energy / 10000, 10),
    };
  }

  // ========================================================================
  // 归一化 [0, 1] - Min-Max标准化
  // ========================================================================

  /**
   * Min-Max归一化
   * 自测: ML-004 归一化边界验证
   * 
   * @param features 原始特征值
   * @returns 归一化到[0,1]范围的12维特征向量
   */
  private normalize(features: FeatureVector): NormalizedFeatures {
    const { velocity, acceleration, curvature, jerk, angle, entropy, fft_freq } = 
      NORMALIZATION_PARAMS;

    /**
     * Min-Max标准化并裁剪到[0,1]
     * 公式: normalized = max(0, min(1, (val - min) / (max - min)))
     */
    const clamp = (val: number, min: number, max: number) => 
      Math.max(0, Math.min(1, (val - min) / (max - min)));

    return [
      // 速度 (3维) - indices 0-2
      clamp(features.velocity_avg, velocity.min, velocity.max),
      clamp(features.velocity_max, velocity.min, velocity.max),
      clamp(features.velocity_std, 0, 500), // std使用固定范围
      
      // 加速度 (2维) - indices 3-4
      clamp(features.acceleration_avg, acceleration.min, acceleration.max),
      clamp(features.acceleration_max, acceleration.min, acceleration.max),
      
      // 曲率 (2维) - indices 5-6
      clamp(features.curvature_avg, curvature.min, curvature.max),
      clamp(features.curvature_max, curvature.min, curvature.max),
      
      // Jerk (1维) - index 7
      clamp(features.jerk_avg, jerk.min, jerk.max),
      
      // 角度变化 (1维) - index 8
      clamp(features.angle_change_rate, angle.min, angle.max),
      
      // 复杂度 (2维) - indices 9-10
      clamp(features.entropy, entropy.min, entropy.max),
      features.straightness, // 已经是 [0, 1]
      
      // 频域 (1维) - index 11
      clamp(features.fft_dominant_freq, fft_freq.min, fft_freq.max),
    ];
  }

  // ========================================================================
  // 内部工具
  // ========================================================================

  private addToHistory(features: NormalizedFeatures): void {
    this.featureHistory.push(features);
    if (this.featureHistory.length > this.maxHistorySize) {
      this.featureHistory.shift();
    }
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

export const featureExtractor = new AliceFeatureExtractor();

export default AliceFeatureExtractor;
