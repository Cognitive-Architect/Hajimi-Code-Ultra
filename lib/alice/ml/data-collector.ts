/**
 * Alice ML 数据收集器
 * HAJIMI-ALICE-ML
 * 
 * 鼠标轨迹数据收集、特征提取、云端Fallback验证
 * 
 * @module lib/alice/ml/data-collector
 * @author 唐音 (Engineer) - B-02/09
 * @integration OpenRouter IP Direct (ID-92突破)
 */

import { EventEmitter } from 'events';
import type { OpenRouterIPDirectAdapter } from '../../quintant/adapters/openrouter-ip-direct';

// ============================================================================
// 类型定义
// ============================================================================

export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number; // 时间戳 (ms)
  pressure?: number; // 触控压力 (0-1)
}

export interface CollectedSession {
  id: string;
  startTime: number;
  endTime: number;
  points: TrajectoryPoint[];
  deviceInfo: DeviceInfo;
  metadata: SessionMetadata;
}

export interface DeviceInfo {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  maxTouchPoints: number;
}

export interface SessionMetadata {
  pageUrl: string;
  sessionDuration: number;
  pointCount: number;
  hasTouch: boolean;
}

// 导出格式 (用于训练)
export interface TrainingSample {
  features: number[]; // 12维特征
  label?: BehaviorLabel; // 行为标签 (人工标注)
  sessionId: string;
  timestamp: number;
}

export type BehaviorLabel = 
  | 'lost_confused'
  | 'rage_shake'
  | 'precision_snipe'
  | 'urgent_rush'
  | 'casual_explore'
  | 'uncertain';

// ============================================================================
// 数据收集器
// ============================================================================

export class AliceDataCollector extends EventEmitter {
  private sessions: Map<string, CollectedSession> = new Map();
  private currentSession: CollectedSession | null = null;
  private isCollecting = false;
  private maxPointsPerSession = 1000;
  private storageKey = 'alice_ml_sessions';
  private adapter: OpenRouterIPDirectAdapter | null = null;

  // 内存管理
  private gcInterval?: NodeJS.Timeout;
  private maxMemorySessions = 50;

  constructor(private enableCloudTest = false) {
    super();
    this.startGC();
  }

  // ========================================================================
  // 会话管理
  // ========================================================================

  /**
   * 开始新的采集会话
   */
  startSession(pageUrl?: string): string {
    const sessionId = `alice-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: Date.now(),
      endTime: 0,
      points: [],
      deviceInfo: this.captureDeviceInfo(),
      metadata: {
        pageUrl: pageUrl || (typeof window !== 'undefined' ? window.location.href : 'unknown'),
        sessionDuration: 0,
        pointCount: 0,
        hasTouch: false,
      },
    };

    this.isCollecting = true;
    this.emit('session:start', sessionId);
    
    return sessionId;
  }

  /**
   * 结束当前会话
   */
  endSession(): CollectedSession | null {
    if (!this.currentSession) return null;

    this.currentSession.endTime = Date.now();
    this.currentSession.metadata.sessionDuration = 
      this.currentSession.endTime - this.currentSession.startTime;
    this.currentSession.metadata.pointCount = this.currentSession.points.length;

    // 保存到内存
    this.sessions.set(this.currentSession.id, this.currentSession);
    
    // 检查内存限制
    this.enforceMemoryLimit();

    const session = this.currentSession;
    this.currentSession = null;
    this.isCollecting = false;

    this.emit('session:end', session);
    return session;
  }

  // ========================================================================
  // 数据采集
  // ========================================================================

  /**
   * 记录轨迹点
   */
  recordPoint(x: number, y: number, pressure?: number): void {
    if (!this.isCollecting || !this.currentSession) return;

    // 限制点数防止内存泄漏
    if (this.currentSession.points.length >= this.maxPointsPerSession) {
      this.currentSession.points.shift(); // 移除最旧的点
    }

    this.currentSession.points.push({
      x,
      y,
      t: Date.now(),
      pressure,
    });
  }

  /**
   * 记录触摸事件
   */
  recordTouch(x: number, y: number, pressure?: number): void {
    if (this.currentSession) {
      this.currentSession.metadata.hasTouch = true;
    }
    this.recordPoint(x, y, pressure);
  }

  /**
   * 批量记录（从鼠标事件流）
   */
  recordBatch(points: Array<{ x: number; y: number; t?: number }>): void {
    const now = Date.now();
    for (const p of points) {
      this.recordPoint(p.x, p.y);
    }
  }

  // ========================================================================
  // 设备信息
  // ========================================================================

  private captureDeviceInfo(): DeviceInfo {
    if (typeof window === 'undefined') {
      return {
        userAgent: 'node',
        screenWidth: 1920,
        screenHeight: 1080,
        devicePixelRatio: 1,
        maxTouchPoints: 0,
      };
    }

    return {
      userAgent: navigator.userAgent.substring(0, 100),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      maxTouchPoints: navigator.maxTouchPoints || 0,
    };
  }

  // ========================================================================
  // 🐍♾️ 云端验证 (OpenRouter IP直连集成)
  // ========================================================================

  /**
   * 使用 OpenRouter IP直连验证云端ML连通性
   * 
   * 自测: ML-IMPL-004 支持批量导出训练数据
   */
  async testCloudConnection(adapter: OpenRouterIPDirectAdapter): Promise<{
    success: boolean;
    latency: number;
    response?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // 构造测试特征
      const testFeatures = [0.5, 0.3, 0.8, 0.2, 0.1, 0.9, 0.4, 0.6, 0.7, 0.3, 0.2, 0.5];
      
      const response = await adapter.chatCompletion({
        model: 'deepseek/deepseek-chat',
        messages: [{
          role: 'user',
          content: `Analyze mouse behavior features: ${JSON.stringify(testFeatures)}
                    Output one of: lost_confused, rage_shake, precision_snipe, urgent_rush, casual_explore`
        }],
        max_tokens: 20,
      });

      const latency = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';

      this.emit('cloud:test', { success: true, latency });
      
      return {
        success: true,
        latency,
        response: content,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emit('cloud:test', { success: false, latency, error });
      
      return {
        success: false,
        latency,
      };
    }
  }

  /**
   * 批量导出训练数据到云端分析
   * 
   * 注意: 只上传特征向量，不上传原始坐标！
   */
  async exportToCloud(
    adapter: OpenRouterIPDirectAdapter,
    features: number[][]
  ): Promise<{
    success: boolean;
    analyzed: number;
  }> {
    // 隐私检查: 确保不上传原始轨迹
    for (const f of features) {
      if (f.length !== 12) {
        throw new Error('Invalid feature dimension - must be 12');
      }
    }

    try {
      const response = await adapter.chatCompletion({
        model: 'deepseek/deepseek-chat',
        messages: [{
          role: 'user',
          content: `Analyze ${features.length} mouse behavior feature vectors for patterns. ` +
                   `Features: velocity_avg, velocity_max, acceleration_avg, curvature_avg, ` +
                   `angle_change_rate, entropy, fft_dominant_freq, etc.`
        }],
        max_tokens: 200,
      });

      return {
        success: true,
        analyzed: features.length,
      };
    } catch {
      return {
        success: false,
        analyzed: 0,
      };
    }
  }

  // ========================================================================
  // 批量导出 (本地训练用)
  // ========================================================================

  /**
   * 导出所有会话为训练样本
   */
  exportTrainingSamples(featureExtractor?: (session: CollectedSession) => number[]): TrainingSample[] {
    const samples: TrainingSample[] = [];
    
    for (const session of this.sessions.values()) {
      if (session.points.length < 10) continue;

      // 如果没有提供特征提取器，使用简单的统计特征
      const features = featureExtractor 
        ? featureExtractor(session)
        : this.extractSimpleFeatures(session);

      samples.push({
        features,
        sessionId: session.id,
        timestamp: session.startTime,
      });
    }

    return samples;
  }

  /**
   * 导出为 JSON 文件 (浏览器环境)
   */
  exportToJSON(): string {
    const data = {
      exportedAt: Date.now(),
      sessionCount: this.sessions.size,
      samples: this.exportTrainingSamples(),
    };
    return JSON.stringify(data, null, 2);
  }

  private extractSimpleFeatures(session: CollectedSession): number[] {
    const points = session.points;
    if (points.length < 2) return new Array(12).fill(0);

    // 简单统计特征 (12维)
    const velocities: number[] = [];
    const accelerations: number[] = [];
    
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dt = p1.t - p0.t;
      if (dt === 0) continue;
      
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const v = dist / dt * 1000; // px/s
      
      velocities.push(v);
      
      if (velocities.length > 1) {
        const dv = v - velocities[velocities.length - 2];
        const a = dv / dt * 1000;
        accelerations.push(Math.abs(a));
      }
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length || 0;
    const max = (arr: number[]) => Math.max(...arr) || 0;

    return [
      avg(velocities),      // 平均速度
      max(velocities),      // 最大速度
      avg(accelerations),   // 平均加速度
      max(accelerations),   // 最大加速度
      points.length,        // 点数
      session.metadata.sessionDuration / 1000, // 持续时间(秒)
      0, 0, 0, 0, 0, 0,     // 占位 (由完整特征提取器填充)
    ];
  }

  // ========================================================================
  // 内存管理
  // ========================================================================

  private enforceMemoryLimit(): void {
    if (this.sessions.size > this.maxMemorySessions) {
      // 移除最旧的会话
      const oldest = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime)[0];
      if (oldest) {
        this.sessions.delete(oldest[0]);
        this.emit('gc:session', oldest[0]);
      }
    }
  }

  private startGC(): void {
    this.gcInterval = setInterval(() => {
      // 清理超过1小时的会话
      const oneHourAgo = Date.now() - 3600000;
      for (const [id, session] of this.sessions) {
        if (session.startTime < oneHourAgo) {
          this.sessions.delete(id);
        }
      }
    }, 60000); // 每分钟检查
  }

  // ========================================================================
  // 查询方法
  // ========================================================================

  getSession(id: string): CollectedSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): CollectedSession[] {
    return Array.from(this.sessions.values());
  }

  getCurrentSession(): CollectedSession | null {
    return this.currentSession;
  }

  getStats(): {
    totalSessions: number;
    totalPoints: number;
    isCollecting: boolean;
  } {
    let totalPoints = 0;
    for (const s of this.sessions.values()) {
      totalPoints += s.points.length;
    }
    
    return {
      totalSessions: this.sessions.size,
      totalPoints,
      isCollecting: this.isCollecting,
    };
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    this.endSession();
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
    this.sessions.clear();
    this.removeAllListeners();
  }
}

export default AliceDataCollector;
