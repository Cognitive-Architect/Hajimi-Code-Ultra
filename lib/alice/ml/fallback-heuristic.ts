/**
 * Alice ML 失效回退与启发式集成
 * HAJIMI-ALICE-ML
 * 
 * ML失效检测、自动回退、诊断报告
 * 
 * @module lib/alice/ml/fallback-heuristic
 * @author 奶龙娘 (Doctor) - B-07/09
 */

import { EventEmitter } from 'events';
import type { NormalizedFeatures } from './feature-extractor';

export type BehaviorPattern = 
  | 'lost_confused'
  | 'rage_shake'
  | 'precision_snipe'
  | 'urgent_rush'
  | 'casual_explore';

export interface MLResult {
  pattern: BehaviorPattern;
  confidence: number;
  latency: number;
  source: 'ml' | 'heuristic';
}

export interface FallbackConfig {
  confidenceThreshold: number;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * ML 回退管理器
 */
export class AliceMLFallback extends EventEmitter {
  private config: FallbackConfig;
  private consecutiveFailures = 0;

  constructor(config?: Partial<FallbackConfig>) {
    super();
    this.config = {
      confidenceThreshold: 0.7,
      timeoutMs: 100,
      maxRetries: 2,
      ...config,
    };
  }

  /**
   * 执行推理（带回退）
   */
  async predictWithFallback(
    features: NormalizedFeatures,
    mlInference: (f: NormalizedFeatures) => Promise<{ pattern: BehaviorPattern; confidence: number }>
  ): Promise<MLResult> {
    const startTime = Date.now();

    try {
      // 尝试 ML 推理（带超时）
      const mlResult = await this.runWithTimeout(
        () => mlInference(features),
        this.config.timeoutMs
      );

      const latency = Date.now() - startTime;

      // 置信度检查
      if (mlResult.confidence >= this.config.confidenceThreshold) {
        this.consecutiveFailures = 0;
        return {
          pattern: mlResult.pattern,
          confidence: mlResult.confidence,
          latency,
          source: 'ml',
        };
      }

      // 置信度低，使用启发式
      this.emit('lowConfidence', { confidence: mlResult.confidence, threshold: this.config.confidenceThreshold });
      
    } catch (error) {
      // ML 失败
      this.consecutiveFailures++;
      this.emit('mlFailure', { error, consecutiveFailures: this.consecutiveFailures });
    }

    // 回退到启发式
    const heuristicResult = this.heuristicPredict(features);
    return {
      ...heuristicResult,
      latency: Date.now() - startTime,
      source: 'heuristic',
    };
  }

  /**
   * 启发式预测（ID-64 简化版）
   */
  private heuristicPredict(features: NormalizedFeatures): { pattern: BehaviorPattern; confidence: number } {
    const [vAvg, vMax, vStd, aAvg, aMax, cAvg, cMax, angle, entropy, straightness] = features;

    // 启发式规则（优先级顺序）
    if (vMax > 0.8 && straightness > 0.9) {
      return { pattern: 'urgent_rush', confidence: 0.75 };
    }
    if (entropy > 0.7 && vAvg < 0.3) {
      return { pattern: 'lost_confused', confidence: 0.72 };
    }
    if (vStd > 0.6 && aMax > 0.7) {
      return { pattern: 'rage_shake', confidence: 0.70 };
    }
    if (straightness > 0.95 && vAvg > 0.5) {
      return { pattern: 'precision_snipe', confidence: 0.78 };
    }

    return { pattern: 'casual_explore', confidence: 0.60 };
  }

  private runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), ms)
      ),
    ]);
  }

  /**
   * 生成诊断报告
   */
  generateDiagnosticReport(): {
    mlHealth: 'healthy' | 'degraded' | 'failed';
    fallbackRate: number;
    averageLatency: number;
    recommendation: string;
  } {
    const health = this.consecutiveFailures > 5 ? 'failed' : 
                   this.consecutiveFailures > 2 ? 'degraded' : 'healthy';

    return {
      mlHealth: health,
      fallbackRate: this.consecutiveFailures / Math.max(1, this.consecutiveFailures + 10),
      averageLatency: 50, // 模拟
      recommendation: health === 'failed' ? 'Switch to heuristic mode' : 'Monitor closely',
    };
  }
}

export default AliceMLFallback;
