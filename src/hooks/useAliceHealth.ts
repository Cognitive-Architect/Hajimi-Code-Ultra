/**
 * Alice健康监测与自愈Hook
 * HAJIMI-ALICE-UI
 * 
 * Code Doctor三级体系集成
 * 
 * @module src/hooks/useAliceHealth
 * @author 奶龙娘 (Doctor) - B-07/09
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface HealthStatus {
  isHealthy: boolean;
  fps: number;
  memoryUsage: number;
  lastJankTime: number;
  issues: string[];
}

export function useAliceHealth() {
  const [health, setHealth] = useState<HealthStatus>({
    isHealthy: true,
    fps: 60,
    memoryUsage: 0,
    lastJankTime: 0,
    issues: [],
  });

  const frameTimes = useRef<number[]>([]);
  const lastFrameTime = useRef<number>(performance.now());
  const rafRef = useRef<number | null>(null);

  // FPS监测
  const checkFPS = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTime.current;
    lastFrameTime.current = now;

    frameTimes.current.push(delta);
    if (frameTimes.current.length > 60) {
      frameTimes.current.shift();
    }

    // 计算平均FPS
    const avgFrameTime = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
    const fps = Math.round(1000 / avgFrameTime);

    // 检测卡顿 (>100ms)
    const issues: string[] = [];
    let lastJankTime = health.lastJankTime;

    if (delta > 100) {
      issues.push(`Jank detected: ${delta.toFixed(0)}ms`);
      lastJankTime = now;
    }

    // 内存检查
    const memoryUsage = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;
    if (memoryUsage > 100) {
      issues.push(`High memory: ${memoryUsage.toFixed(0)}MB`);
    }

    setHealth({
      isHealthy: issues.length === 0 && fps > 30,
      fps,
      memoryUsage,
      lastJankTime,
      issues,
    });

    rafRef.current = requestAnimationFrame(checkFPS);
  }, [health.lastJankTime]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(checkFPS);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [checkFPS]);

  // 诊断报告
  const generateReport = useCallback(() => {
    return {
      timestamp: Date.now(),
      health,
      userAgent: navigator.userAgent,
      screen: { width: window.screen.width, height: window.screen.height },
    };
  }, [health]);

  return { health, generateReport };
}

export default useAliceHealth;
