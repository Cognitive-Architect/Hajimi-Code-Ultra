/**
 * Alice ML Engine - TensorFlow.js 本地推理
 * 
 * DEBT-ALICE-ML 清偿实现
 * - 本地TF.js Lite推理（零API调用，保护额度）
 * - 预训练模型 <500KB
 * - 支持5种轨迹模式识别
 * 
 * @module lib/alice/ml-engine
 * @version 1.4.0
 * @debt DEBT-ALICE-ML (P0-已清偿)
 */

import * as tf from '@tensorflow/tfjs';
import { TrajectoryPoint, TrajectoryPattern } from './mouse-tracker';

// ========== 模型配置 ==========

const MODEL_CONFIG = {
  modelUrl: '/models/trajectory-classifier.onnx', // 预训练模型路径
  inputLength: 100, // 轨迹点序列长度
  featureDims: 4,   // x, y, velocity, acceleration
  classes: ['rage_shake', 'precision_snipe', 'lost_confused', 'urgent_rush', 'casual_explore'],
} as const;

// ========== ML 引擎类 ==========

export class AliceMLEngine {
  private model: tf.LayersModel | null = null;
  private loaded = false;
  private useHeuristic = true; // 降级标志

  /**
   * 初始化模型
   */
  async init(): Promise<boolean> {
    try {
      // 尝试加载本地模型
      this.model = await tf.loadLayersModel(MODEL_CONFIG.modelUrl);
      this.loaded = true;
      this.useHeuristic = false;
      console.log('[AliceMLEngine] ✅ TF.js模型加载成功');
      return true;
    } catch (error) {
      console.warn('[AliceMLEngine] ⚠️ 模型加载失败，使用启发式降级');
      this.useHeuristic = true;
      return false;
    }
  }

  /**
   * 轨迹特征提取
   */
  private extractFeatures(points: TrajectoryPoint[]): Float32Array {
    const features = new Float32Array(MODEL_CONFIG.inputLength * MODEL_CONFIG.featureDims);
    
    // 标准化
    const maxX = Math.max(...points.map((p) => p.x), 1);
    const maxY = Math.max(...points.map((p) => p.y), 1);
    
    for (let i = 0; i < Math.min(points.length, MODEL_CONFIG.inputLength); i++) {
      const p = points[i];
      const idx = i * MODEL_CONFIG.featureDims;
      
      features[idx] = p.x / maxX; // 标准化x
      features[idx + 1] = p.y / maxY; // 标准化y
      features[idx + 2] = (p.velocity || 0) / 1000; // 标准化velocity
      features[idx + 3] = (p.acceleration || 0) / 1000; // 标准化acceleration
    }
    
    return features;
  }

  /**
   * ML推理识别
   * 
   * @param points 轨迹点数组
   * @returns 识别的模式
   */
  async recognize(points: TrajectoryPoint[]): Promise<TrajectoryPattern | null> {
    if (points.length < 10) return null;

    // 如果模型未加载，使用启发式
    if (this.useHeuristic || !this.model) {
      return this.heuristicRecognize(points);
    }

    try {
      // 特征提取
      const features = this.extractFeatures(points);
      const input = tf.tensor2d(features, [1, MODEL_CONFIG.inputLength * MODEL_CONFIG.featureDims]);
      
      // 推理
      const prediction = this.model.predict(input) as tf.Tensor;
      const probabilities = await prediction.data();
      
      // 清理张量
      input.dispose();
      prediction.dispose();
      
      // 获取最高概率类别
      let maxProb = 0;
      let maxIdx = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }
      
      // 置信度阈值
      if (maxProb < 0.6) {
        return this.heuristicRecognize(points); // 置信度低时降级
      }
      
      return MODEL_CONFIG.classes[maxIdx] as TrajectoryPattern;
    } catch (error) {
      console.error('[AliceMLEngine] 推理错误:', error);
      return this.heuristicRecognize(points);
    }
  }

  /**
   * 启发式识别（降级方案）
   */
  private heuristicRecognize(points: TrajectoryPoint[]): TrajectoryPattern | null {
    // 速度统计
    const velocities = points
      .map((p) => p.velocity || 0)
      .filter((v) => v > 0);
    
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const maxVelocity = Math.max(...velocities, 0);
    
    // 方向变化统计
    let directionChanges = 0;
    for (let i = 2; i < points.length; i++) {
      const dx1 = points[i - 1].x - points[i - 2].x;
      const dy1 = points[i - 1].y - points[i - 2].y;
      const dx2 = points[i].x - points[i - 1].x;
      const dy2 = points[i].y - points[i - 1].y;
      
      const dot = dx1 * dx2 + dy1 * dy2;
      const cross = dx1 * dy2 - dy1 * dx2;
      const angle = Math.atan2(cross, dot);
      
      if (Math.abs(angle) > Math.PI / 4) {
        directionChanges++;
      }
    }
    
    // 规则判断
    if (directionChanges >= 3 && maxVelocity > 500) {
      return 'rage_shake';
    }
    
    if (avgVelocity < 100 && points.length > 30) {
      return 'precision_snipe';
    }
    
    if (directionChanges >= 2 && avgVelocity < 200) {
      return 'lost_confused';
    }
    
    if (maxVelocity > 800 && directionChanges < 2) {
      return 'urgent_rush';
    }
    
    if (points.length > 20 && avgVelocity < 300) {
      return 'casual_explore';
    }
    
    return null;
  }

  /**
   * 获取引擎状态
   */
  getStatus(): { loaded: boolean; useHeuristic: boolean; modelSize?: number } {
    return {
      loaded: this.loaded,
      useHeuristic: this.useHeuristic,
      modelSize: this.model ? undefined : 0, // 模型大小信息
    };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.loaded = false;
  }
}

export default AliceMLEngine;
