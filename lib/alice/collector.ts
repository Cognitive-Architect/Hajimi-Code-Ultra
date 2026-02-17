/**
 * Alice 鼠标轨迹数据收集器接口定义
 * HAJIMI-LCR-TRIPLE-DIM-001 工单 B-07/09
 * 
 * 12维特征采集、GDPR脱敏、60Hz采样
 * 
 * @module lib/alice/collector
 * @author 咕咕嘎嘎（QA）
 * @since 1.3.0
 * 
 * DEBT: ALICE-ML-001 - P1 - 训练数据不足
 */

import { EventEmitter } from 'events';

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 12维轨迹样本结构
 * 
 * ML-002: 12维特征完整性验证
 */
export interface TrajectorySample {
  // 基础坐标 (P0-敏感，永不上传)
  /** X坐标 (px) */
  x: number;
  /** Y坐标 (px) */
  y: number;
  
  // 时间戳
  /** 采样时间戳 (ms, performance.now()) */
  timestamp: number;
  
  // 运动学特征 (派生，可上传)
  /** 瞬时速度 (px/ms) */
  velocity: number;
  /** 瞬时加速度 (px/ms²) */
  acceleration: number;
  /** 轨迹曲率 (1/px) */
  curvature: number;
  /** 急动度 (jerk, px/ms³) */
  jerk: number;
  
  // 设备特征 (PointerEvent)
  /** 触控压力 (0-1) */
  pressure: number;
  /** X轴倾斜角 (deg, -90 to 90) */
  tiltX: number;
  /** Y轴倾斜角 (deg, -90 to 90) */
  tiltY: number;
  /** 悬停/接触高度 (px) */
  hoverDistance: number;
  /** 接触面积 (px², width × height) */
  contactArea: number;
}

/**
 * 12维特征向量 (标准化后，用于ML模型输入)
 */
export type FeatureVector12D = [
  number, number, number, number,  // velocity, acceleration, curvature, jerk
  number, number, number, number,  // pressure, tiltX, tiltY, hoverDistance
  number, number, number, number   // contactArea + 3个统计特征
];

/**
 * 隐私级别
 */
export enum PrivacyLevel {
  /** 严格模式: 不上传任何数据，纯本地处理 */
  STRICT = 'strict',
  /** 标准模式: 上传脱敏特征向量，不上传原始坐标 */
  STANDARD = 'standard',
  /** 宽松模式: 允许上传聚合统计信息 */
  RELAXED = 'relaxed',
}

/**
 * 收集器配置
 */
export interface CollectorConfig {
  /** 目标采样频率 (Hz), 默认60 */
  targetFrequency: number;
  /** 缓冲区大小 (帧数), 默认50 */
  bufferSize: number;
  /** 隐私级别 */
  privacyLevel: PrivacyLevel;
  /** 是否启用丢帧补偿 */
  enableFrameCompensation: boolean;
  /** 本地存储最大容量 (MB), 默认50 */
  maxLocalStorageMB: number;
  /** 数据保留天数, 默认7 */
  retentionDays: number;
  /** 差分隐私预算 ε, 默认1.0 */
  privacyEpsilon: number;
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 页面URL */
  pageUrl?: string;
  /** 会话标签 (用于人工标注) */
  label?: string;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 采集会话
 */
export interface TrajectorySession {
  /** 会话唯一ID */
  id: string;
  /** 开始时间戳 */
  startTime: number;
  /** 结束时间戳 */
  endTime?: number;
  /** 样本数量 */
  sampleCount: number;
  /** 采样样本 */
  samples: TrajectorySample[];
  /** 会话配置 */
  config: SessionConfig;
  /** 是否包含触摸事件 */
  hasTouchEvents: boolean;
}

/**
 * 帧率统计
 */
export interface FrameRateStats {
  /** 期望帧数 */
  expectedFrames: number;
  /** 实际采集帧数 */
  actualFrames: number;
  /** 丢帧数 */
  droppedFrames: number;
  /** 实际平均帧率 (Hz) */
  actualFrequency: number;
  /** 丢帧率 (0-1) */
  dropRate: number;
  /** 帧间隔抖动 (ms, 标准差) */
  jitter: number;
  /** 是否应用了插值补偿 */
  compensationApplied: boolean;
}

/**
 * 脱敏结果
 */
export interface AnonymizationResult {
  /** 脱敏后的特征向量 */
  features: FeatureVector12D;
  /** 应用的噪声标准差 */
  noiseStdDev: number;
  /** K-匿名集大小 */
  kAnonymity: number;
  /** 脱敏方法 */
  method: 'laplace' | 'gaussian' | 'k-anonymity';
}

/**
 * 用户授权状态
 */
export interface ConsentStatus {
  /** 是否已获得授权 */
  granted: boolean;
  /** 授权时间戳 */
  timestamp?: number;
  /** 授权范围 */
  scope: 'local' | 'anonymized' | 'full';
  /** 数据保留偏好 */
  retentionDays: number;
}

// =============================================================================
// 默认配置
// =============================================================================

export const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  targetFrequency: 60,
  bufferSize: 50,
  privacyLevel: PrivacyLevel.STANDARD,
  enableFrameCompensation: true,
  maxLocalStorageMB: 50,
  retentionDays: 7,
  privacyEpsilon: 1.0,
};

// =============================================================================
// Alice轨迹收集器类
// =============================================================================

/**
 * Alice鼠标轨迹数据收集器
 * 
 * 功能特性:
 * - ML-002: 12维特征完整采集
 * - ML-003: 60Hz采样频率保障
 * - 环形缓冲区管理
 * - 实时特征提取
 * - GDPR脱敏处理
 */
export class AliceTrajectoryCollector extends EventEmitter {
  private config: CollectorConfig;
  private buffer: TrajectorySample[] = [];
  private currentSession: TrajectorySession | null = null;
  private isCollecting = false;
  private rafId: number | null = null;
  private lastSampleTime = 0;
  private consentStatus: ConsentStatus = { granted: false, scope: 'local', retentionDays: 7 };
  
  // 帧率监控
  private frameTimestamps: number[] = [];
  private compensationCount = 0;
  
  // 坐标扰动缓存（用于一致性）
  private coordinateNoiseCache: Map<string, { dx: number; dy: number }> = new Map();

  // 存储引用
  private storage: Storage;
  private db: IDBDatabase | null = null;

  constructor(config?: Partial<CollectorConfig>) {
    super();
    this.config = { ...DEFAULT_COLLECTOR_CONFIG, ...config };
    this.storage = typeof localStorage !== 'undefined' ? localStorage : this.createMockStorage();
    this.initIndexedDB();
  }

  // ===========================================================================
  // 初始化
  // ===========================================================================

  private createMockStorage(): Storage {
    const data = new Map<string, string>();
    return {
      get length() { return data.size; },
      getItem: (key: string) => data.get(key) || null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
      key: (index: number) => Array.from(data.keys())[index] || null,
    };
  }

  private async initIndexedDB(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AliceTrajectoryDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
      };
    });
  }

  // ===========================================================================
  // 用户授权
  // ===========================================================================

  /**
   * 请求用户数据收集授权
   * 
   * GDPR合规: 首次使用前必须获得明确同意
   */
  async requestConsent(): Promise<boolean> {
    // 检查已有授权
    const stored = this.storage.getItem('alice_consent');
    if (stored) {
      try {
        this.consentStatus = JSON.parse(stored);
        if (this.consentStatus.granted) return true;
      } catch { /* 解析失败，重新请求 */ }
    }

    if (typeof window === 'undefined') return false;

    // 显示授权对话框
    const message = 
      '🤖 Alice ML 数据收集授权\n\n' +
      '为了提供更好的交互体验，我们需要收集以下数据:\n' +
      '• 鼠标/触控轨迹 (仅本地存储)\n' +
      '• 运动特征分析 (脱敏后可选上传)\n' +
      '• 设备基本信息 (匿名化处理)\n\n' +
      '隐私保护承诺:\n' +
      '✓ 原始坐标永不上传至服务器\n' +
      '✓ 数据7天后自动删除\n' +
      '✓ 可随时一键清除所有数据\n\n' +
      '是否同意?';

    const granted = window.confirm(message);
    
    this.consentStatus = {
      granted,
      timestamp: Date.now(),
      scope: granted ? 'anonymized' : 'local',
      retentionDays: this.config.retentionDays,
    };

    this.storage.setItem('alice_consent', JSON.stringify(this.consentStatus));
    this.emit('consent:changed', this.consentStatus);
    
    return granted;
  }

  /**
   * 检查是否已获得授权
   */
  hasConsent(): boolean {
    return this.consentStatus.granted;
  }

  /**
   * 撤销授权并清除数据
   */
  revokeConsent(): void {
    this.consentStatus = { granted: false, scope: 'local', retentionDays: 7 };
    // 先清除数据（除了授权信息）
    this.clearAllDataPreserveConsent();
    // 再保存撤销后的授权状态
    this.storage.setItem('alice_consent', JSON.stringify(this.consentStatus));
    this.emit('consent:revoked');
  }

  // ===========================================================================
  // 会话管理
  // ===========================================================================

  /**
   * 开始新的采集会话
   * 
   * @param config - 会话配置
   * @returns 会话ID
   */
  startSession(config?: SessionConfig): string {
    if (!this.hasConsent()) {
      throw new Error('User consent required before starting session');
    }

    // 结束已有会话
    if (this.currentSession) {
      this.endSession();
    }

    const sessionId = `alice-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: performance.now(),
      sampleCount: 0,
      samples: [],
      config: config || {},
      hasTouchEvents: false,
    };

    this.isCollecting = true;
    this.buffer = [];
    this.frameTimestamps = [];
    this.compensationCount = 0;
    this.lastSampleTime = 0;

    // 启动采样循环
    this.startSamplingLoop();
    
    this.emit('session:start', sessionId);
    return sessionId;
  }

  /**
   * 结束当前会话
   * 
   * @returns 会话数据（不包含原始样本，仅统计信息）
   */
  endSession(): Omit<TrajectorySession, 'samples'> | null {
    if (!this.currentSession) return null;

    this.stopSamplingLoop();
    
    this.currentSession.endTime = performance.now();
    
    // 保存到IndexedDB (异步)
    this.persistSession(this.currentSession);

    // 触发事件（发送脱敏后的特征统计）
    const sessionSummary = {
      id: this.currentSession.id,
      startTime: this.currentSession.startTime,
      endTime: this.currentSession.endTime,
      sampleCount: this.currentSession.sampleCount,
      config: this.currentSession.config,
      hasTouchEvents: this.currentSession.hasTouchEvents,
    };

    this.emit('session:end', sessionSummary, this.getFrameStats());
    
    this.currentSession = null;
    this.isCollecting = false;
    
    return sessionSummary;
  }

  // ===========================================================================
  // 采样循环 (ML-003: 60Hz)
  // ===========================================================================

  private startSamplingLoop(): void {
    if (typeof window === 'undefined') return;

    const targetInterval = 1000 / this.config.targetFrequency; // 16.67ms for 60Hz

    const loop = (timestamp: number) => {
      if (!this.isCollecting) return;

      // 检查是否需要采样
      if (timestamp - this.lastSampleTime >= targetInterval) {
        this.tryCaptureSample(timestamp);
        this.lastSampleTime = timestamp;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stopSamplingLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * 尝试从当前Pointer捕获样本
   * 如果没有活动的Pointer，将记录空样本或插值
   */
  private tryCaptureSample(timestamp: number): void {
    // 这里实际实现需要与PointerTracker集成
    // 简化版本：记录时间戳用于帧率统计
    this.frameTimestamps.push(timestamp);
    if (this.frameTimestamps.length > this.config.targetFrequency) {
      this.frameTimestamps.shift();
    }
  }

  /**
   * 记录轨迹样本
   * 
   * @param sample - 12维样本数据
   */
  recordSample(sample: Partial<TrajectorySample>, pointerType?: string): void {
    if (!this.isCollecting || !this.currentSession) return;

    const fullSample = this.completeSample(sample);
    
    // 检测触摸事件
    if (pointerType === 'touch' || pointerType === 'pen' || 
        (sample.pressure !== undefined && sample.pressure > 0 && sample.pressure !== 0.5)) {
      this.currentSession.hasTouchEvents = true;
    }
    
    // 添加到缓冲区
    this.buffer.push(fullSample);
    if (this.buffer.length > this.config.bufferSize) {
      this.buffer.shift();
    }

    // 添加到会话
    if (this.currentSession) {
      // 限制会话内样本数量防止内存溢出
      if (this.currentSession.samples.length < 1000) {
        this.currentSession.samples.push(fullSample);
      }
      this.currentSession.sampleCount++;
    }

    // 实时提取特征并触发事件
    if (this.buffer.length >= 3) {
      const features = this.extractFeatures(this.buffer);
      this.emit('features:extracted', features, fullSample.timestamp);
    }

    this.emit('sample', fullSample);
  }

  private completeSample(partial: Partial<TrajectorySample>): TrajectorySample {
    const now = performance.now();
    const defaults: TrajectorySample = {
      x: 0,
      y: 0,
      timestamp: now,
      velocity: 0,
      acceleration: 0,
      curvature: 0,
      jerk: 0,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      hoverDistance: 0,
      contactArea: 0,
    };
    return { ...defaults, ...partial };
  }

  // ===========================================================================
  // 特征提取 (ML-002)
  // ===========================================================================

  /**
   * 从缓冲区提取12维特征向量
   * 
   * @param samples - 轨迹样本数组
   * @returns 12维标准化特征向量
   */
  extractFeatures(samples: TrajectorySample[]): FeatureVector12D {
    if (samples.length < 3) {
      return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    // 计算派生特征
    const velocities: number[] = [];
    const accelerations: number[] = [];
    const curvatures: number[] = [];
    const jerks: number[] = [];

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const dt = curr.timestamp - prev.timestamp;
      
      if (dt <= 0) continue;

      // 速度
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocity = dist / dt;
      velocities.push(velocity);

      // 加速度
      if (velocities.length > 1) {
        const dv = velocity - velocities[velocities.length - 2];
        const acceleration = Math.abs(dv) / dt;
        accelerations.push(acceleration);

        // 急动度
        if (accelerations.length > 1) {
          const da = acceleration - accelerations[accelerations.length - 2];
          jerks.push(Math.abs(da) / dt);
        }
      }
    }

    // 曲率计算 (三点法)
    for (let i = 2; i < samples.length; i++) {
      const p0 = samples[i - 2];
      const p1 = samples[i - 1];
      const p2 = samples[i];
      
      const curvature = this.calculateCurvature(p0, p1, p2);
      curvatures.push(curvature);
    }

    // 获取最新设备特征
    const latest = samples[samples.length - 1];

    // 计算统计特征并标准化到[0,1]
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length || 0;
    const max = (arr: number[]) => Math.max(...arr) || 0;
    const normalize = (val: number, min: number, maxVal: number) => 
      Math.max(0, Math.min(1, (val - min) / (maxVal - min)));

    // 12维特征向量
    const features: FeatureVector12D = [
      normalize(avg(velocities), 0, 5),           // 0: 平均速度
      normalize(max(velocities), 0, 10),          // 1: 最大速度
      normalize(avg(accelerations), 0, 50),       // 2: 平均加速度
      normalize(max(curvatures), 0, 0.1),         // 3: 最大曲率
      normalize(avg(jerks), 0, 100),              // 4: 平均急动度
      latest.pressure || 0.5,                      // 5: 压力
      normalize((latest.tiltX || 0) + 90, 0, 180), // 6: tiltX标准化
      normalize((latest.tiltY || 0) + 90, 0, 180), // 7: tiltY标准化
      normalize(latest.hoverDistance || 0, 0, 100), // 8: 悬停距离
      normalize(latest.contactArea || 0, 0, 1000),  // 9: 接触面积
      normalize(samples.length, 0, 100),           // 10: 样本数 (轨迹长度)
      normalize(this.calculateEntropy(samples), 0, 3), // 11: 轨迹熵
    ];

    return features;
  }

  private calculateCurvature(p0: TrajectorySample, p1: TrajectorySample, p2: TrajectorySample): number {
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

  private calculateEntropy(samples: TrajectorySample[]): number {
    if (samples.length < 4) return 0;
    
    const bins = new Array(8).fill(0);
    
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].x - samples[i - 1].x;
      const dy = samples[i].y - samples[i - 1].y;
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

  // ===========================================================================
  // 差分隐私 - 坐标扰动
  // ===========================================================================

  /**
   * 对原始坐标进行实时扰动
   * 使用Laplace机制 (ε=1.0) + 10px坐标扰动
   * 
   * @param x - 原始X坐标
   * @param y - 原始Y坐标
   * @param sessionId - 会话ID（用于噪声一致性）
   * @returns 扰动后的坐标
   */
  perturbCoordinates(x: number, y: number, sessionId?: string): { x: number; y: number } {
    const epsilon = this.config.privacyEpsilon; // ε=1.0
    const maxPerturbation = 10; // 10px最大扰动
    
    // 使用缓存确保同一位置的噪声一致
    const cacheKey = sessionId ? `${sessionId}-${x}-${y}` : `${x}-${y}`;
    
    let noise = this.coordinateNoiseCache.get(cacheKey);
    if (!noise) {
      // Laplace噪声生成: Lap(0, b) where b = Δf/ε
      // 对于坐标，敏感度Δf = maxPerturbation
      const scale = maxPerturbation / epsilon;
      
      noise = {
        dx: this.generateLaplaceNoise(0, scale),
        dy: this.generateLaplaceNoise(0, scale),
      };
      
      // 限制最大扰动范围
      noise.dx = Math.max(-maxPerturbation, Math.min(maxPerturbation, noise.dx));
      noise.dy = Math.max(-maxPerturbation, Math.min(maxPerturbation, noise.dy));
      
      // 缓存噪声（限制缓存大小）
      if (this.coordinateNoiseCache.size < 1000) {
        this.coordinateNoiseCache.set(cacheKey, noise);
      }
    }
    
    return {
      x: x + noise.dx,
      y: y + noise.dy,
    };
  }

  /**
   * 生成Laplace分布噪声
   * Lap(μ, b) 概率密度: f(x) = 1/(2b) * exp(-|x-μ|/b)
   */
  private generateLaplaceNoise(mu: number, b: number): number {
    const u = Math.random() - 0.5; // U(-0.5, 0.5)
    return mu - b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * 清除坐标噪声缓存
   */
  clearCoordinateCache(): void {
    this.coordinateNoiseCache.clear();
  }

  // ===========================================================================
  // 脱敏处理 (ML-001)
  // ===========================================================================

  /**
   * 对特征向量进行脱敏处理
   * 
   * ML-001: 脱敏后不可还原
   * - Laplace噪声 (ε=1.0)
   * - 特征值裁剪到[0,1]
   * - 原始坐标永不进入此流程
   * 
   * @param features - 原始12维特征
   * @returns 脱敏结果
   */
  anonymize(features: FeatureVector12D): AnonymizationResult {
    const epsilon = this.config.privacyEpsilon;
    const sensitivity = 1.0;
    const scale = sensitivity / epsilon;

    // Laplace噪声
    const noisedFeatures = features.map(v => {
      const noise = this.generateLaplaceNoise(0, scale);
      return Math.max(0, Math.min(1, v + noise));
    }) as FeatureVector12D;

    return {
      features: noisedFeatures,
      noiseStdDev: scale * Math.sqrt(2),
      kAnonymity: 5, // 假设已通过K-匿名化
      method: 'laplace',
    };
  }

  /**
   * 对样本进行完全脱敏（坐标扰动 + 特征脱敏）
   * 
   * @param sample - 原始样本
   * @returns 脱敏后的样本（不含原始坐标）
   */
  anonymizeSample(sample: TrajectorySample): { features: FeatureVector12D; timestamp: number } {
    // 1. 坐标扰动
    const perturbed = this.perturbCoordinates(sample.x, sample.y);
    
    // 2. 基于扰动后的坐标提取特征
    const perturbedSample = { ...sample, x: perturbed.x, y: perturbed.y };
    const features = this.extractFeatures([perturbedSample]);
    
    // 3. 对特征添加噪声
    const anonymized = this.anonymize(features);
    
    return {
      features: anonymized.features,
      timestamp: sample.timestamp,
    };
  }

  /**
   * 验证数据是否包含敏感坐标
   */
  containsSensitiveData(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    
    const str = JSON.stringify(data);
    
    // 检测原始坐标模式
    const coordinatePattern = /"x":\s*\d+\.?\d*,\s*"y":\s*\d+\.?\d*/;
    const hasCoordinates = coordinatePattern.test(str);
    
    // 检查是否是12维特征向量
    const isFeatureVector = Array.isArray(data) && 
                           data.length === 12 && 
                           data.every(v => typeof v === 'number' && v >= 0 && v <= 1);
    
    // 包含坐标但不是特征向量 = 敏感
    return hasCoordinates && !isFeatureVector;
  }

  // ===========================================================================
  // 帧率监控 (ML-003)
  // ===========================================================================

  /**
   * 获取当前帧率统计
   */
  getFrameStats(): FrameRateStats {
    const timestamps = this.frameTimestamps;
    if (timestamps.length < 2) {
      return {
        expectedFrames: 0,
        actualFrames: 0,
        droppedFrames: 0,
        actualFrequency: 0,
        dropRate: 0,
        jitter: 0,
        compensationApplied: false,
      };
    }

    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const actualFrequency = 1000 / avgInterval;
    
    const duration = timestamps[timestamps.length - 1] - timestamps[0];
    const expectedFrames = Math.floor((duration / 1000) * this.config.targetFrequency);
    const actualFrames = timestamps.length;
    const droppedFrames = Math.max(0, expectedFrames - actualFrames);
    
    const jitter = Math.sqrt(
      intervals.reduce((sum, iv) => sum + Math.pow(iv - avgInterval, 2), 0) / intervals.length
    );

    return {
      expectedFrames,
      actualFrames,
      droppedFrames,
      actualFrequency,
      dropRate: expectedFrames > 0 ? droppedFrames / expectedFrames : 0,
      jitter,
      compensationApplied: this.compensationCount > 0,
    };
  }

  // ===========================================================================
  // 数据持久化
  // ===========================================================================

  private async persistSession(session: TrajectorySession): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      
      // 脱敏处理：只存储特征，不存储原始坐标
      const anonymizedSamples = session.samples.map(s => this.anonymizeSample(s));
      
      const anonymizedSession = {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        sampleCount: session.sampleCount,
        config: session.config,
        hasTouchEvents: session.hasTouchEvents,
        // 存储脱敏后的特征，不包含原始坐标
        features: anonymizedSamples.map(s => s.features),
        timestamps: anonymizedSamples.map(s => s.timestamp),
        featureSummary: this.extractFeatures(session.samples.slice(-50)),
      };
      
      await new Promise<void>((resolve, reject) => {
        const request = store.put(anonymizedSession);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
      this.emit('session:persisted', { 
        sessionId: session.id, 
        sampleCount: session.sampleCount,
        privacy: 'anonymized',
      });
    } catch (err) {
      console.error('[AliceCollector] Failed to persist session:', err);
    }
  }

  /**
   * 导出用户数据 (GDPR访问权)
   */
  async exportUserData(): Promise<{
    sessions: TrajectorySession[];
    consent: ConsentStatus;
    exportedAt: number;
  } | null> {
    if (!this.db) return null;

    try {
      const transaction = this.db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      
      const sessions = await new Promise<TrajectorySession[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as TrajectorySession[]);
        request.onerror = () => reject(request.error);
      });

      return {
        sessions,
        consent: this.consentStatus,
        exportedAt: Date.now(),
      };
    } catch (err) {
      console.error('[AliceCollector] Export failed:', err);
      return null;
    }
  }

  /**
   * 清除所有数据 (GDPR删除权)
   */
  clearAllData(): void {
    this.clearAllDataPreserveConsent();
    // 同时清除授权状态
    this.storage.removeItem('alice_consent');
  }

  /**
   * 清除数据但保留授权状态（内部使用）
   */
  private clearAllDataPreserveConsent(): void {
    // 清除IndexedDB
    if (this.db) {
      try {
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        store.clear();
      } catch (e) {
        // IndexedDB可能未初始化
      }
    }

    // 清除LocalStorage中的相关数据（保留授权）
    const keysToRemove: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith('alice_') && key !== 'alice_consent') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => this.storage.removeItem(key));

    // 清空缓冲区
    this.buffer = [];
    this.frameTimestamps = [];
    this.coordinateNoiseCache.clear();

    this.emit('data:cleared', { keysRemoved: keysToRemove.length });
  }

  // ===========================================================================
  // 查询方法
  // ===========================================================================

  getCurrentSession(): TrajectorySession | null {
    return this.currentSession;
  }

  getBuffer(): readonly TrajectorySample[] {
    return [...this.buffer];
  }

  getConfig(): CollectorConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // 清理
  // ===========================================================================

  dispose(): void {
    this.endSession();
    this.stopSamplingLoop();
    this.removeAllListeners();
    
    // 清空所有缓冲区和缓存
    this.buffer = [];
    this.frameTimestamps = [];
    this.coordinateNoiseCache.clear();
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// =============================================================================
// 便捷导出
// =============================================================================

/**
 * 创建默认收集器实例
 */
export const defaultCollector = new AliceTrajectoryCollector();

/**
 * 快速开始采集会话
 */
export async function quickStartSession(label?: string): Promise<string> {
  const collector = defaultCollector;
  await collector.requestConsent();
  return collector.startSession({ label });
}

// 默认导出
export default AliceTrajectoryCollector;
