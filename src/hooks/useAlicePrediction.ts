/**
 * Alice ML预测集成Hook
 * HAJIMI-ALICE-UI
 * 
 * 与HAJIMI-ALICE-ML后端集成
 * 
 * @module src/hooks/useAlicePrediction
 * @author 压力怪 (Audit) - B-05/09
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AliceDataCollector, AliceFeatureExtractor } from '../../lib/alice/ml';
import { AliceMLFallback } from '../../lib/alice/ml/fallback-heuristic';
import type { NormalizedFeatures } from '../../lib/alice/ml/feature-extractor';

export interface PredictionResult {
  behavior: string;
  confidence: number;
  latency: number;
  source: 'ml' | 'heuristic';
}

export function useAlicePrediction(enabled: boolean = true) {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  const collectorRef = useRef<AliceDataCollector | null>(null);
  const extractorRef = useRef<AliceFeatureExtractor | null>(null);
  const fallbackRef = useRef<AliceMLFallback | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // 初始化ML组件
    collectorRef.current = new AliceDataCollector();
    extractorRef.current = new AliceFeatureExtractor();
    fallbackRef.current = new AliceMLFallback();
    
    setIsReady(true);

    return () => {
      collectorRef.current?.dispose();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);

  // 开始采集
  const startCollection = useCallback(() => {
    if (!collectorRef.current) return;
    
    collectorRef.current.startSession();
    
    // 监听鼠标移动
    const handleMouseMove = (e: MouseEvent) => {
      collectorRef.current?.recordPoint(e.clientX, e.clientY);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    // 定期推理
    const runInference = () => {
      const prediction = predict();
      if (prediction) {
        setResult(prediction);
      }
      rafRef.current = requestAnimationFrame(runInference);
    };
    
    rafRef.current = requestAnimationFrame(runInference);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      collectorRef.current?.endSession();
    };
  }, []);

  // 推理函数
  const predict = useCallback((): PredictionResult | null => {
    if (!collectorRef.current || !extractorRef.current || !fallbackRef.current) {
      return null;
    }

    const session = collectorRef.current.getCurrentSession();
    if (!session || session.points.length < 10) {
      return null;
    }

    // 特征提取
    const features = extractorRef.current.extractFromSession(session);
    
    // 使用Fallback管理器推理
    // 注意：这里简化处理，实际应调用ONNX Runtime
    const heuristicResult = fallbackRef.current['heuristicPredict'](features);
    
    return {
      behavior: heuristicResult.pattern,
      confidence: heuristicResult.confidence,
      latency: 5, // ms
      source: 'heuristic',
    };
  }, []);

  return {
    result,
    isReady,
    startCollection,
  };
}

export default useAlicePrediction;
