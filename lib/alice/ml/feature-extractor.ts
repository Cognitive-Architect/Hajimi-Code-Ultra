/**
 * Alice ML 特征提取器
 * HAJIMI-ALICE-ML
 * 
 * 12维特征向量提取：速度/加速度/曲率/角度/熵/频域
 * 
 * @module lib/alice/ml/feature-extractor
 * @author 唐音 (Engineer) - B-02/09
 */

import type { TrajectoryPoint, CollectedSession } from './data-collector';

// ============================================================================
// 特征定义
// ============================================================================

export interface FeatureVector {
  // 速度特征 (3维)
  velocity_avg: number;
  velocity_max: number;
  velocity_std: number;
  
  // 加速度特征 (2维)
  acceleration_avg: number;
  acceleration_max: number;
  
  // 曲率特征 (2维)
  curvature_avg: number;
  curvature_max: number;
  
  // 角度变化 (1维)
  angle_change_rate: number;
  
  // 复杂度特征 (2维)
  entropy: number;
  straightness: number;
  
  // 频域特征 (2维)
  fft_dominant_freq: number;
  fft_energy: number;
}

export type NormalizedFeatures = [
  number, number, number, // velocity
  number, number,         // acceleration
  number, number,         // curvature
  number,                 // angle
  number, number,         // complexity
  number, number,         // frequency
];

// ============================================================================
// 特征提取器
// ============================================================================

export class AliceFeatureExtractor {
  // 归一化参数 (来自训练数据统计)
  private normalizationParams = {
    velocity: { min: 0, max: 2000 },      // px/s
    acceleration: { min: 0, max: 50000 }, // px/s²
    curvature: { min: 0, max: 0.1 },      // 1/px
    angle: { min: 0, max: Math.PI },      // rad
    entropy: { min: 0, max: 3 },
    fft_freq: { min: 0, max: 30 },        // Hz
  };

  /**
   * 从轨迹点提取完整特征向量
   * 
   * 自测: ML-IMPL-001 特征维度≥12维
   * 自测: ML-IMPL-003 实时特征计算<16ms
   */
  extract(points: TrajectoryPoint[]): NormalizedFeatures {
    const startTime = performance.now();
    
    if (points.length < 3) {
      return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    // 计算中间特征
    const velocities = this.calculateVelocities(points);
    const accelerations = this.calculateAccelerations(velocities);
    const curvatures = this.calculateCurvatures(points);
    const angles = this.calculateAngleChanges(points);
    
    // 组装特征
    const features: FeatureVector = {
      velocity_avg: this.avg(velocities),
      velocity_max: Math.max(...velocities),
      velocity_std: this.std(velocities),
      
      acceleration_avg: this.avg(accelerations),
      acceleration_max: Math.max(...accelerations),
      
      curvature_avg: this.avg(curvatures),
      curvature_max: Math.max(...curvatures),
      
      angle_change_rate: this.sum(angles) / points.length,
      
      entropy: this.calculateEntropy(points),
      straightness: this.calculateStraightness(points),
      
      fft_dominant_freq: 0, // 简化版本
      fft_energy: 0,        // 简化版本
    };

    // 计算频域特征 (如果点数足够)
    if (points.length >= 32) {
      const fft = this.calculateFFT(points);
      features.fft_dominant_freq = fft.dominantFreq;
      features.fft_energy = fft.energy;
    }

    const duration = performance.now() - startTime;
    
    // 性能警告
    if (duration > 16) {
      console.warn(`[ALICE-ML] Feature extraction slow: ${duration.toFixed(2)}ms`);
    }

    return this.normalize(features);
  }

  /**
   * 从会话提取特征
   */
  extractFromSession(session: CollectedSession): NormalizedFeatures {
    return this.extract(session.points);
  }

  // ========================================================================
  // 基础计算
  // ========================================================================

  private calculateVelocities(points: TrajectoryPoint[]): number[] {
    const velocities: number[] = [];
    
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
    }
    
    return velocities.length > 0 ? velocities : [0];
  }

  private calculateAccelerations(velocities: number[]): number[] {
    const accelerations: number[] = [];
    
    for (let i = 1; i < velocities.length; i++) {
      const dv = velocities[i] - velocities[i - 1];
      accelerations.push(Math.abs(dv));
    }
    
    return accelerations.length > 0 ? accelerations : [0];
  }

  private calculateCurvatures(points: TrajectoryPoint[]): number[] {
    const curvatures: number[] = [];
    
    for (let i = 2; i < points.length; i++) {
      const p0 = points[i - 2];
      const p1 = points[i - 1];
      const p2 = points[i];
      
      const curvature = this.calculateCurvature(p0, p1, p2);
      curvatures.push(curvature);
    }
    
    return curvatures.length > 0 ? curvatures : [0];
  }

  private calculateCurvature(p0: TrajectoryPoint, p1: TrajectoryPoint, p2: TrajectoryPoint): number {
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;
    
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    
    if (dist1 * dist2 < 0.001) return 0;
    
    return cross / (dist1 * dist2);
  }

  private calculateAngleChanges(points: TrajectoryPoint[]): number[] {
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
    
    return changes.length > 0 ? changes : [0];
  }

  // ========================================================================
  // 复杂度特征
  // ========================================================================

  /**
   * 计算轨迹熵 (方向随机性)
   */
  private calculateEntropy(points: TrajectoryPoint[]): number {
    if (points.length < 4) return 0;
    
    // 将方向分为8个区间，计算分布熵
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
    
    return entropy;
  }

  /**
   * 计算直线度 (端点距离 / 路径长度)
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
    return straightDist / pathLength;
  }

  // ========================================================================
  // 频域特征 (简化FFT)
  // ========================================================================

  private calculateFFT(points: TrajectoryPoint[]): { dominantFreq: number; energy: number } {
    // 简化版：使用速度序列的自相关估计主导频率
    const velocities = this.calculateVelocities(points);
    if (velocities.length < 4) return { dominantFreq: 0, energy: 0 };
    
    // 零穿越率估计频率
    let zeroCrossings = 0;
    const mean = this.avg(velocities);
    
    for (let i = 1; i < velocities.length; i++) {
      if ((velocities[i - 1] - mean) * (velocities[i] - mean) < 0) {
        zeroCrossings++;
      }
    }
    
    const duration = (points[points.length - 1].t - points[0].t) / 1000; // seconds
    const freq = duration > 0 ? zeroCrossings / 2 / duration : 0;
    
    // 能量 = 方差
    const energy = velocities.reduce((sum, v) => sum + (v - mean) ** 2, 0) / velocities.length;
    
    return {
      dominantFreq: Math.min(freq, 30), // 限制在30Hz以内
      energy: Math.min(energy / 10000, 10), // 归一化
    };
  }

  // ========================================================================
  // 归一化
  // ========================================================================

  private normalize(features: FeatureVector): NormalizedFeatures {
    const norm = (val: number, min: number, max: number) => 
      Math.max(0, Math.min(1, (val - min) / (max - min)));
    
    return [
      norm(features.velocity_avg, this.normalizationParams.velocity.min, this.normalizationParams.velocity.max),
      norm(features.velocity_max, this.normalizationParams.velocity.min, this.normalizationParams.velocity.max),
      norm(features.velocity_std, 0, 500),
      
      norm(features.acceleration_avg, this.normalizationParams.acceleration.min, this.normalizationParams.acceleration.max),
      norm(features.acceleration_max, this.normalizationParams.acceleration.min, this.normalizationParams.acceleration.max),
      
      norm(features.curvature_avg, this.normalizationParams.curvature.min, this.normalizationParams.curvature.max),
      norm(features.curvature_max, this.normalizationParams.curvature.min, this.normalizationParams.curvature.max),
      
      norm(features.angle_change_rate, this.normalizationParams.angle.min, this.normalizationParams.angle.max),
      
      norm(features.entropy, this.normalizationParams.entropy.min, this.normalizationParams.entropy.max),
      features.straightness, // 已经是 0-1
      
      norm(features.fft_dominant_freq, this.normalizationParams.fft_freq.min, this.normalizationParams.fft_freq.max),
      norm(features.fft_energy, 0, 10),
    ];
  }

  // ========================================================================
  // 工具函数
  // ========================================================================

  private avg(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length || 0;
  }

  private std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = this.avg(arr);
    const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  private sum(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0);
  }
}

// 便捷实例
export const featureExtractor = new AliceFeatureExtractor();

export default AliceFeatureExtractor;
