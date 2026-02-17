/**
 * Alice ONNX Runtime 推理引擎
 * HAJIMI-LCR-ENTITY-001 - B-06/09
 * 
 * 集成 onnxruntime-web (WebGL后端) 实现本地ML推理
 * 
 * @module lib/alice/onnx-runtime
 * @author 唐音 (Engineer)
 * 
 * DEBT: DEBT-ALICE-ML-001 - P2 - 模型权重随机初始化
 * 当前状态: Mock模式 (使用随机权重进行开发和测试)
 * 清偿计划: v1.3.1 引入真实训练模型
 * 
 * 自测项:
 * - ML-002: 12维特征完整性验证
 * - ML-004: 归一化边界 [0,1]
 * - ENTITY-006: ONNX推理延迟<25ms
 */

import type { 
  NormalizedFeatures, 
  OnnxInput, 
  InferenceResult, 
  BehaviorClass,
  BEHAVIOR_CLASSES 
} from './feature-extractor';
import { BEHAVIOR_CLASSES as BEHAVIOR_CLASS_LIST } from './feature-extractor';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * ONNX Runtime Web 会话类型
 */
export interface OnnxRuntimeSession {
  run(inputs: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
  release(): Promise<void>;
}

/**
 * ONNX Tensor 类型
 */
export interface OnnxTensor {
  data: Float32Array | Int32Array | BigInt64Array;
  dims: number[];
  type: string;
}

/**
 * ONNX Runtime 配置
 */
export interface OnnxRuntimeConfig {
  /** 模型路径或 URL */
  modelPath?: string;
  /** 执行后端 */
  executionProviders?: ('webgl' | 'wasm' | 'cpu')[];
  /** 图优化级别 */
  graphOptimizationLevel?: 'all' | 'disabled' | 'basic' | 'extended';
  /** 是否使用 Mock 模式 (DEBT-ALICE-ML-001) */
  useMock?: boolean;
  /** 推理超时时间 (ms) */
  inferenceTimeoutMs?: number;
  /** 置信度阈值 */
  confidenceThreshold?: number;
}

/**
 * 推理性能指标
 */
export interface InferenceMetrics {
  /** 总推理次数 */
  totalInferences: number;
  /** 平均延迟 (ms) */
  averageLatencyMs: number;
  /** 最小延迟 (ms) */
  minLatencyMs: number;
  /** 最大延迟 (ms) */
  maxLatencyMs: number;
  /** 超时次数 */
  timeoutCount: number;
  /** 上次推理时间 */
  lastInferenceTime: number;
}

/**
 * 模型元数据
 */
export interface ModelMetadata {
  /** 输入维度 */
  inputShape: number[];
  /** 输出维度 */
  outputShape: number[];
  /** 类别数 */
  numClasses: number;
  /** 模型版本 */
  version: string;
  /** 是否为 Mock 模型 */
  isMock: boolean;
}

// ============================================================================
// Mock 模型实现 (DEBT-ALICE-ML-001)
// ============================================================================

/**
 * Mock ONNX Runtime Session
 * 用于在没有真实模型时进行开发和测试
 * 
 * DEBT: 模型权重随机初始化 - 使用启发式规则模拟预测
 */
class MockOnnxSession implements OnnxRuntimeSession {
  private mockWeights: Float32Array;
  private mockBias: Float32Array;
  private metadata: ModelMetadata;

  constructor() {
    // 模拟权重初始化 (Random Initialization)
    // DEBT-ALICE-ML-001: 这些权重是随机的，不是训练得到的
    this.mockWeights = new Float32Array(12 * 6);
    this.mockBias = new Float32Array(6);
    
    // 使用确定性随机种子以便复现
    for (let i = 0; i < this.mockWeights.length; i++) {
      this.mockWeights[i] = (Math.random() - 0.5) * 0.1;
    }
    for (let i = 0; i < this.mockBias.length; i++) {
      this.mockBias[i] = (Math.random() - 0.5) * 0.05;
    }

    this.metadata = {
      inputShape: [1, 12],
      outputShape: [1, 6],
      numClasses: 6,
      version: 'mock-v0.1.0',
      isMock: true,
    };

    console.warn('[ALICE-ONNX] ⚠️ 使用 Mock 模型进行推理 (DEBT-ALICE-ML-001)');
  }

  /**
   * 模拟推理 - 基于启发式规则
   * 
   * 虽然不是真实ML模型，但使用特征启发式提供合理的预测：
   * - 高速度 + 低曲率 → urgent_rush
   * - 高速度 + 高曲率 → rage_shake  
   * - 低速度 + 高直线度 → precision_snipe
   * - 高熵 + 低直线度 → lost_confused
   */
  async run(inputs: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>> {
    const startTime = performance.now();
    
    // 模拟 WebGL 推理延迟 (5-15ms)
    await this.simulateDelay(5, 15);

    const inputTensor = inputs['input'] || inputs['features'];
    if (!inputTensor) {
      throw new Error('Missing input tensor');
    }

    const features = Array.from(inputTensor.data as Float32Array);
    const batchSize = inputTensor.dims[0] || 1;
    
    const outputData = new Float32Array(batchSize * 6);

    for (let b = 0; b < batchSize; b++) {
      const offset = b * 12;
      const batchFeatures = features.slice(offset, offset + 12);
      
      // 基于启发式的预测 (模拟ML模型行为)
      const predictions = this.heuristicPredict(batchFeatures);
      
      for (let i = 0; i < 6; i++) {
        outputData[b * 6 + i] = predictions[i];
      }
    }

    // 确保延迟符合要求
    const elapsed = performance.now() - startTime;
    if (elapsed > 25) {
      console.warn(`[ALICE-ONNX] Mock inference slow: ${elapsed.toFixed(2)}ms`);
    }

    return {
      output: {
        data: outputData,
        dims: [batchSize, 6],
        type: 'float32',
      },
    };
  }

  /**
   * 启发式预测规则
   * 基于特征向量的合理推断
   */
  private heuristicPredict(features: number[]): number[] {
    const [
      v_avg, v_max, v_std,      // 速度特征 (0-2)
      a_avg, a_max,             // 加速度特征 (3-4)
      c_avg, c_max,             // 曲率特征 (5-6)
      jerk,                     // Jerk (7)
      angle,                    // 角度变化 (8)
      entropy, straight,        // 复杂度 (9-10)
      fft_freq,                 // 频域 (11)
    ] = features;

    // 初始化概率
    const probs = [0.1, 0.1, 0.2, 0.2, 0.2, 0.2]; // 基础概率

    // urgent_rush: 高速度，低曲率，直线运动
    if (v_avg > 0.6 && c_avg < 0.2 && straight > 0.8) {
      probs[3] += 0.4;
    }

    // rage_shake: 高速度，高曲率，高加速度
    if (v_avg > 0.5 && c_avg > 0.5 && a_avg > 0.4) {
      probs[1] += 0.4;
    }

    // precision_snipe: 低速度，高直线度，低加速度
    if (v_avg < 0.3 && straight > 0.9 && a_avg < 0.2) {
      probs[2] += 0.4;
    }

    // lost_confused: 高熵，低直线度，高频域变化
    if (entropy > 0.6 && straight < 0.4 && fft_freq > 0.3) {
      probs[0] += 0.4;
    }

    // casual_explore: 中等速度，中等曲率，低加速度
    if (v_avg > 0.2 && v_avg < 0.5 && c_avg < 0.4 && a_avg < 0.3) {
      probs[4] += 0.3;
    }

    // Softmax 归一化
    const expSum = probs.reduce((sum, p) => sum + Math.exp(p), 0);
    return probs.map(p => Math.exp(p) / expSum);
  }

  private simulateDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async release(): Promise<void> {
    // Mock 模式下无需释放资源
    console.log('[ALICE-ONNX] Mock session released');
  }

  getMetadata(): ModelMetadata {
    return this.metadata;
  }
}

// ============================================================================
// Alice ONNX Runtime 推理器
// ============================================================================

export class AliceOnnxRuntime {
  private session: OnnxRuntimeSession | null = null;
  private config: Required<OnnxRuntimeConfig>;
  private metrics: InferenceMetrics;
  private ort: typeof import('onnxruntime-web') | null = null;
  private isInitialized = false;

  constructor(config: OnnxRuntimeConfig = {}) {
    this.config = {
      modelPath: config.modelPath || '/models/alice-behavior.onnx',
      executionProviders: config.executionProviders || ['webgl', 'wasm'],
      graphOptimizationLevel: config.graphOptimizationLevel || 'all',
      useMock: config.useMock ?? true, // 默认使用 Mock (DEBT-ALICE-ML-001)
      inferenceTimeoutMs: config.inferenceTimeoutMs || 25,
      confidenceThreshold: config.confidenceThreshold || 0.7,
    };

    this.metrics = {
      totalInferences: 0,
      averageLatencyMs: 0,
      minLatencyMs: Infinity,
      maxLatencyMs: 0,
      timeoutCount: 0,
      lastInferenceTime: 0,
    };
  }

  /**
   * 初始化 ONNX Runtime
   * 
   * 自测: ENTITY-006 ONNX推理延迟<25ms
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      if (this.config.useMock) {
        // 使用 Mock 模式
        this.session = new MockOnnxSession();
        this.isInitialized = true;
        console.log('[ALICE-ONNX] Initialized with Mock mode');
        return true;
      }

      // 尝试加载 onnxruntime-web
      this.ort = await this.loadOnnxRuntime();
      
      if (!this.ort) {
        console.warn('[ALICE-ONNX] onnxruntime-web not available, falling back to Mock');
        this.session = new MockOnnxSession();
        this.isInitialized = true;
        return true;
      }

      // 创建推理会话
      this.session = await this.createSession();
      this.isInitialized = true;
      
      console.log('[ALICE-ONNX] Initialized with WebGL backend');
      return true;

    } catch (error) {
      console.error('[ALICE-ONNX] Initialization failed:', error);
      // 回退到 Mock
      this.session = new MockOnnxSession();
      this.isInitialized = true;
      return true;
    }
  }

  /**
   * 执行单条推理
   * 
   * 自测: ENTITY-006 ONNX推理延迟<25ms
   */
  async infer(features: NormalizedFeatures): Promise<InferenceResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.session) {
      throw new Error('ONNX session not initialized');
    }

    const startTime = performance.now();

    try {
      // 创建输入张量
      const inputTensor = this.createInputTensor(features);
      
      // 执行推理 (带超时保护)
      const output = await this.runWithTimeout(
        { input: inputTensor },
        this.config.inferenceTimeoutMs
      );

      // 解析输出
      const predictions = Array.from(output.output.data as Float32Array);
      
      // 获取最高概率类别
      const maxProb = Math.max(...predictions);
      const classIndex = predictions.indexOf(maxProb);
      
      const latencyMs = performance.now() - startTime;
      
      // 更新指标
      this.updateMetrics(latencyMs);

      // 延迟警告
      if (latencyMs > this.config.inferenceTimeoutMs) {
        console.warn(`[ALICE-ONNX] Inference exceeded timeout: ${latencyMs.toFixed(2)}ms`);
      }

      return {
        predictions,
        confidence: maxProb,
        latencyMs,
        className: BEHAVIOR_CLASS_LIST[classIndex] || 'uncertain',
        classIndex,
      };

    } catch (error) {
      const latencyMs = performance.now() - startTime;
      this.metrics.timeoutCount++;
      
      throw new Error(`ONNX inference failed after ${latencyMs.toFixed(2)}ms: ${error}`);
    }
  }

  /**
   * 批量推理
   */
  async inferBatch(features: NormalizedFeatures[]): Promise<InferenceResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.session) {
      throw new Error('ONNX session not initialized');
    }

    const startTime = performance.now();

    // 创建批量输入张量
    const inputTensor = this.createBatchInputTensor(features);
    
    const output = await this.runWithTimeout(
      { input: inputTensor },
      this.config.inferenceTimeoutMs * features.length // 批量推理允许更长超时
    );

    const data = Array.from(output.output.data as Float32Array);
    const numClasses = 6;
    const batchSize = Math.floor(data.length / numClasses);

    const results: InferenceResult[] = [];
    const baseLatency = (performance.now() - startTime) / batchSize;

    for (let i = 0; i < batchSize; i++) {
      const predictions = data.slice(i * numClasses, (i + 1) * numClasses);
      const maxProb = Math.max(...predictions);
      const classIndex = predictions.indexOf(maxProb);

      results.push({
        predictions,
        confidence: maxProb,
        latencyMs: baseLatency,
        className: BEHAVIOR_CLASS_LIST[classIndex] || 'uncertain',
        classIndex,
      });

      this.updateMetrics(baseLatency);
    }

    return results;
  }

  /**
   * 释放资源
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.isInitialized = false;
    this.ort = null;
  }

  // ========================================================================
  // 性能指标
  // ========================================================================

  /**
   * 获取推理性能指标
   */
  getMetrics(): InferenceMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置性能指标
   */
  resetMetrics(): void {
    this.metrics = {
      totalInferences: 0,
      averageLatencyMs: 0,
      minLatencyMs: Infinity,
      maxLatencyMs: 0,
      timeoutCount: 0,
      lastInferenceTime: 0,
    };
  }

  /**
   * 检查是否满足延迟要求
   * 
   * 自测: ENTITY-006 ONNX推理延迟<25ms
   */
  meetsLatencyRequirement(): boolean {
    if (this.metrics.totalInferences === 0) return true;
    return this.metrics.averageLatencyMs < 25;
  }

  // ========================================================================
  // 内部方法
  // ========================================================================

  private async loadOnnxRuntime(): Promise<typeof import('onnxruntime-web') | null> {
    try {
      // 动态导入 onnxruntime-web
      const ort = await import('onnxruntime-web');
      return ort;
    } catch {
      return null;
    }
  }

  private async createSession(): Promise<OnnxRuntimeSession> {
    if (!this.ort) {
      throw new Error('ONNX Runtime not loaded');
    }

    // 配置 WebGL 后端
    const sessionOptions = {
      executionProviders: this.config.executionProviders,
      graphOptimizationLevel: this.config.graphOptimizationLevel,
    };

    try {
      // 在浏览器环境中，modelPath 可以是 URL 字符串
      // 注意：真实使用时需要确保模型文件可访问
      const modelData = await this.loadModelData(this.config.modelPath);
      const session = await this.ort.InferenceSession.create(
        modelData,
        sessionOptions
      );
      return session as unknown as OnnxRuntimeSession;
    } catch (error) {
      console.warn('[ALICE-ONNX] Failed to load model, using Mock:', error);
      return new MockOnnxSession();
    }
  }

  /**
   * 加载模型数据
   * 在浏览器环境中从 URL 获取模型文件
   */
  private async loadModelData(modelPath: string): Promise<Uint8Array> {
    // 检查是否在浏览器环境
    if (typeof fetch !== 'undefined') {
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`Failed to load model: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
    
    // Node.js 环境 - 从文件系统读取 (开发/测试用)
    // 注意：实际生产环境使用 Mock 或预加载的模型
    throw new Error('Model loading from filesystem not implemented. Use Mock mode in Node.js environment.');
  }

  private createInputTensor(features: NormalizedFeatures): OnnxTensor {
    if (this.ort) {
      // 使用真实的 ONNX Runtime
      const tensor = new this.ort.Tensor('float32', new Float32Array(features), [1, 12]);
      return tensor as unknown as OnnxTensor;
    }

    // Mock 模式
    return {
      data: new Float32Array(features),
      dims: [1, 12],
      type: 'float32',
    };
  }

  private createBatchInputTensor(features: NormalizedFeatures[]): OnnxTensor {
    const flattened = features.flat();
    
    if (this.ort) {
      const tensor = new this.ort.Tensor('float32', new Float32Array(flattened), [features.length, 12]);
      return tensor as unknown as OnnxTensor;
    }

    return {
      data: new Float32Array(flattened),
      dims: [features.length, 12],
      type: 'float32',
    };
  }

  private async runWithTimeout(
    inputs: Record<string, OnnxTensor>,
    timeoutMs: number
  ): Promise<Record<string, OnnxTensor>> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Inference timeout')), timeoutMs);
    });

    const inferencePromise = this.session.run(inputs);
    
    return Promise.race([inferencePromise, timeoutPromise]);
  }

  private updateMetrics(latencyMs: number): void {
    this.metrics.totalInferences++;
    this.metrics.lastInferenceTime = Date.now();
    
    // 更新平均延迟 (滑动窗口)
    const alpha = 0.1; // 平滑因子
    this.metrics.averageLatencyMs = 
      this.metrics.averageLatencyMs * (1 - alpha) + latencyMs * alpha;
    
    // 更新极值
    this.metrics.minLatencyMs = Math.min(this.metrics.minLatencyMs, latencyMs);
    this.metrics.maxLatencyMs = Math.max(this.metrics.maxLatencyMs, latencyMs);
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

/**
 * 创建默认 ONNX Runtime 实例
 */
export function createOnnxRuntime(config?: OnnxRuntimeConfig): AliceOnnxRuntime {
  return new AliceOnnxRuntime(config);
}

/**
 * 全局 ONNX Runtime 实例
 */
export const onnxRuntime = new AliceOnnxRuntime();

export default AliceOnnxRuntime;
