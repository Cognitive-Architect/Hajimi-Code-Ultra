/**
 * HAJIMI-PHASE2-IMPL-001: B-02/06
 * 蓝绿热切换机制
 * 
 * 实现零停机部署、健康检查与回滚
 * @module lib/polyglot/hot-swap/blue-green
 * 
 * 自测指标：
 * - POL-002：切换延迟 < 30s
 */

import { EventEmitter } from 'events';

/**
 * 热切换配置
 */
export interface HotSwapConfig {
  // 基础配置
  strategy: 'blue-green' | 'canary' | 'rolling';
  healthCheckPath: string;
  healthCheckInterval: number; // ms
  healthCheckTimeout: number; // ms
  
  // 切换配置
  switchTimeout: number; // ms，默认30000ms (30s)
  warmupTime: number; // ms，新实例预热时间
  cooldownTime: number; // ms，旧实例冷却时间
  
  // 回滚配置
  autoRollback: boolean;
  rollbackThreshold: number; // 错误率阈值
  rollbackWindow: number; // ms，评估窗口
  
  // 流量配置
  trafficSplit: number; // 0-100，新实例流量百分比
  stickySessions: boolean;
  sessionCookie: string;
  
  // 监控配置
  metricsEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 默认配置
 */
export const defaultHotSwapConfig: HotSwapConfig = {
  strategy: 'blue-green',
  healthCheckPath: '/health',
  healthCheckInterval: 5000,
  healthCheckTimeout: 3000,
  switchTimeout: 30000,
  warmupTime: 10000,
  cooldownTime: 60000,
  autoRollback: true,
  rollbackThreshold: 0.05, // 5%错误率
  rollbackWindow: 60000,
  trafficSplit: 0,
  stickySessions: false,
  sessionCookie: 'hajimi.session',
  metricsEnabled: true,
  logLevel: 'info',
};

/**
 * 实例状态
 */
export enum InstanceStatus {
  STARTING = 'starting',
  WARMING_UP = 'warming_up',
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  ACTIVE = 'active',
  DRAINING = 'draining',
  STOPPED = 'stopped',
  ERROR = 'error',
}

/**
 * 实例信息
 */
export interface Instance {
  id: string;
  name: 'blue' | 'green';
  version: string;
  status: InstanceStatus;
  endpoint: string;
  startTime: number;
  lastHealthCheck: number;
  requestCount: number;
  errorCount: number;
  responseTime: number; // ms
  memoryUsage: number; // MB
  cpuUsage: number; // percentage
  activeConnections: number;
}

/**
 * 切换状态
 */
export enum SwitchState {
  IDLE = 'idle',
  PREPARING = 'preparing',
  WARMING_UP = 'warming_up',
  SWITCHING = 'switching',
  VERIFYING = 'verifying',
  COMPLETED = 'completed',
  ROLLING_BACK = 'rolling_back',
  FAILED = 'failed',
}

/**
 * 切换结果
 */
export interface SwitchResult {
  success: boolean;
  fromInstance: string;
  toInstance: string;
  startTime: number;
  endTime: number;
  duration: number; // ms
  errors: string[];
  state: SwitchState;
}

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  healthy: boolean;
  statusCode: number;
  responseTime: number;
  body?: any;
  error?: string;
  timestamp: number;
}

/**
 * 指标数据
 */
export interface Metrics {
  totalSwitches: number;
  successfulSwitches: number;
  failedSwitches: number;
  rollbackCount: number;
  averageSwitchTime: number;
  lastSwitchTime: number;
  uptime: number;
}

/**
 * 蓝绿部署管理器
 */
export class BlueGreenManager extends EventEmitter {
  private config: HotSwapConfig;
  private blue?: Instance;
  private green?: Instance;
  private active: 'blue' | 'green';
  private switchState: SwitchState;
  private currentSwitch?: SwitchResult;
  private metrics: Metrics;
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  private rollbackTimer?: NodeJS.Timeout;
  private requestHistory: { timestamp: number; success: boolean }[] = [];
  
  constructor(config: Partial<HotSwapConfig> = {}) {
    super();
    this.config = { ...defaultHotSwapConfig, ...config };
    this.active = 'blue';
    this.switchState = SwitchState.IDLE;
    this.metrics = {
      totalSwitches: 0,
      successfulSwitches: 0,
      failedSwitches: 0,
      rollbackCount: 0,
      averageSwitchTime: 0,
      lastSwitchTime: 0,
      uptime: Date.now(),
    };
  }
  
  /**
   * 初始化实例
   */
  async initialize(blueConfig: Partial<Instance>, greenConfig?: Partial<Instance>): Promise<void> {
    this.emit('initializing');
    
    // 创建Blue实例
    this.blue = this.createInstance('blue', blueConfig);
    await this.startInstance(this.blue);
    this.active = 'blue';
    
    // 创建Green实例（如果提供配置）
    if (greenConfig) {
      this.green = this.createInstance('green', greenConfig);
    }
    
    this.emit('initialized', { blue: this.blue, green: this.green });
  }
  
  /**
   * 创建实例
   */
  private createInstance(name: 'blue' | 'green', config: Partial<Instance>): Instance {
    return {
      id: `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      version: config.version || '1.0.0',
      status: InstanceStatus.STARTING,
      endpoint: config.endpoint || `http://localhost:${name === 'blue' ? 3000 : 3001}`,
      startTime: Date.now(),
      lastHealthCheck: 0,
      requestCount: 0,
      errorCount: 0,
      responseTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      activeConnections: 0,
      ...config,
    };
  }
  
  /**
   * 启动实例
   */
  private async startInstance(instance: Instance): Promise<void> {
    this.emit('instance:starting', instance);
    
    instance.status = InstanceStatus.STARTING;
    
    try {
      // 启动健康检查
      this.startHealthCheck(instance);
      
      // 等待实例就绪
      await this.waitForHealthy(instance, this.config.switchTimeout);
      
      instance.status = InstanceStatus.HEALTHY;
      this.emit('instance:started', instance);
    } catch (error) {
      instance.status = InstanceStatus.ERROR;
      this.emit('instance:error', instance, error);
      throw error;
    }
  }
  
  /**
   * 执行蓝绿切换
   * @param targetVersion 目标版本
   * @returns 切换结果
   */
  async switch(targetVersion: string): Promise<SwitchResult> {
    if (this.switchState !== SwitchState.IDLE) {
      throw new Error(`Cannot switch: current state is ${this.switchState}`);
    }
    
    const fromName = this.active;
    const toName = this.active === 'blue' ? 'green' : 'blue';
    const fromInstance = this[fromName]!;
    
    // 初始化切换结果
    this.currentSwitch = {
      success: false,
      fromInstance: fromName,
      toInstance: toName,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      errors: [],
      state: SwitchState.PREPARING,
    };
    
    this.switchState = SwitchState.PREPARING;
    this.emit('switch:started', this.currentSwitch);
    
    try {
      // 1. 准备新实例
      this.switchState = SwitchState.WARMING_UP;
      const toInstance = await this.prepareInstance(toName, targetVersion);
      
      // 2. 预热新实例
      await this.warmupInstance(toInstance);
      
      // 3. 执行切换
      this.switchState = SwitchState.SWITCHING;
      await this.performSwitch(fromInstance, toInstance);
      
      // 4. 验证切换
      this.switchState = SwitchState.VERIFYING;
      await this.verifySwitch(toInstance);
      
      // 5. 完成切换
      this.switchState = SwitchState.COMPLETED;
      this.finalizeSwitch(true);
      
      // 6. 启动旧实例冷却
      this.drainInstance(fromInstance);
      
      return this.currentSwitch;
      
    } catch (error) {
      this.switchState = SwitchState.FAILED;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.currentSwitch.errors.push(errorMsg);
      this.finalizeSwitch(false);
      
      // 自动回滚
      if (this.config.autoRollback) {
        await this.rollback();
      }
      
      throw error;
    }
  }
  
  /**
   * 准备实例
   */
  private async prepareInstance(name: 'blue' | 'green', version: string): Promise<Instance> {
    this.emit('switch:preparing', { name, version });
    
    // 创建或更新实例
    let instance = this[name];
    
    if (!instance || instance.status === InstanceStatus.ERROR) {
      instance = this.createInstance(name, {
        version,
        endpoint: name === 'blue' 
          ? `http://localhost:3000` 
          : `http://localhost:3001`,
      });
      this[name] = instance;
    }
    
    instance.version = version;
    instance.status = InstanceStatus.STARTING;
    instance.startTime = Date.now();
    
    // 启动实例
    await this.startInstance(instance);
    
    return instance;
  }
  
  /**
   * 预热实例
   */
  private async warmupInstance(instance: Instance): Promise<void> {
    this.emit('switch:warming', instance);
    instance.status = InstanceStatus.WARMING_UP;
    
    // 发送预热请求
    const warmupStart = Date.now();
    const warmupRequests = 10;
    
    for (let i = 0; i < warmupRequests; i++) {
      try {
        await this.healthCheck(instance);
      } catch (error) {
        // 预热失败不中断，继续尝试
      }
    }
    
    // 确保至少预热配置的时间
    const elapsed = Date.now() - warmupStart;
    const remaining = this.config.warmupTime - elapsed;
    if (remaining > 0) {
      await this.sleep(remaining);
    }
    
    instance.status = InstanceStatus.HEALTHY;
  }
  
  /**
   * 执行切换
   */
  private async performSwitch(from: Instance, to: Instance): Promise<void> {
    this.emit('switch:performing', { from, to });
    
    // 原子切换
    const oldActive = this.active;
    this.active = to.name;
    to.status = InstanceStatus.ACTIVE;
    
    // 更新负载均衡器或代理配置
    this.emit('switch:traffic', {
      oldActive,
      newActive: to.name,
      endpoint: to.endpoint,
    });
    
    // 等待一小段时间确保流量切换
    await this.sleep(1000);
  }
  
  /**
   * 验证切换
   */
  private async verifySwitch(instance: Instance): Promise<void> {
    this.emit('switch:verifying', instance);
    
    // 执行多次健康检查
    const verifyChecks = 5;
    for (let i = 0; i < verifyChecks; i++) {
      const result = await this.healthCheck(instance);
      if (!result.healthy) {
        throw new Error(`Verification failed: health check returned unhealthy`);
      }
      await this.sleep(500);
    }
    
    // 启动自动回滚监控
    if (this.config.autoRollback) {
      this.startRollbackMonitor();
    }
  }
  
  /**
   * 完成切换
   */
  private finalizeSwitch(success: boolean): void {
    if (!this.currentSwitch) return;
    
    this.currentSwitch.endTime = Date.now();
    this.currentSwitch.duration = this.currentSwitch.endTime - this.currentSwitch.startTime;
    this.currentSwitch.success = success;
    this.currentSwitch.state = success ? SwitchState.COMPLETED : SwitchState.FAILED;
    
    // 更新指标
    this.metrics.totalSwitches++;
    if (success) {
      this.metrics.successfulSwitches++;
    } else {
      this.metrics.failedSwitches++;
    }
    this.metrics.lastSwitchTime = this.currentSwitch.endTime;
    
    // 计算平均切换时间
    const totalTime = this.metrics.averageSwitchTime * (this.metrics.totalSwitches - 1) 
      + this.currentSwitch.duration;
    this.metrics.averageSwitchTime = totalTime / this.metrics.totalSwitches;
    
    this.emit(success ? 'switch:completed' : 'switch:failed', this.currentSwitch);
    
    // 重置状态
    if (success) {
      this.switchState = SwitchState.IDLE;
    }
  }
  
  /**
   * 实例冷却/排空
   */
  private drainInstance(instance: Instance): void {
    instance.status = InstanceStatus.DRAINING;
    this.emit('instance:draining', instance);
    
    // 等待现有连接完成
    setTimeout(() => {
      instance.status = InstanceStatus.STOPPED;
      this.stopHealthCheck(instance);
      this.emit('instance:stopped', instance);
    }, this.config.cooldownTime);
  }
  
  /**
   * 回滚
   */
  async rollback(): Promise<void> {
    if (this.switchState === SwitchState.IDLE) {
      throw new Error('No active switch to rollback');
    }
    
    this.switchState = SwitchState.ROLLING_BACK;
    this.emit('rollback:started', this.currentSwitch);
    
    try {
      // 切换回之前的活跃实例
      const previousActive = this.currentSwitch?.fromInstance;
      if (previousActive && this[previousActive]) {
        this.active = previousActive;
        this[previousActive]!.status = InstanceStatus.ACTIVE;
      }
      
      this.metrics.rollbackCount++;
      this.emit('rollback:completed');
      
    } catch (error) {
      this.emit('rollback:failed', error);
      throw error;
    } finally {
      this.switchState = SwitchState.IDLE;
      this.currentSwitch = undefined;
    }
  }
  
  /**
   * 启动健康检查
   */
  private startHealthCheck(instance: Instance): void {
    const timer = setInterval(async () => {
      try {
        const result = await this.healthCheck(instance);
        instance.lastHealthCheck = Date.now();
        
        if (result.healthy) {
          if (instance.status !== InstanceStatus.ACTIVE) {
            instance.status = InstanceStatus.HEALTHY;
          }
        } else {
          instance.status = InstanceStatus.UNHEALTHY;
        }
      } catch (error) {
        instance.status = InstanceStatus.UNHEALTHY;
      }
    }, this.config.healthCheckInterval);
    
    this.healthCheckTimers.set(instance.id, timer);
  }
  
  /**
   * 停止健康检查
   */
  private stopHealthCheck(instance: Instance): void {
    const timer = this.healthCheckTimers.get(instance.id);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(instance.id);
    }
  }
  
  /**
   * 执行健康检查
   */
  private async healthCheck(instance: Instance): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // 模拟HTTP健康检查
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);
      
      const response = await fetch(`${instance.endpoint}${this.config.healthCheckPath}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const responseTime = Date.now() - startTime;
      const body = response.status === 200 ? await response.json().catch(() => null) : null;
      
      instance.responseTime = responseTime;
      
      return {
        healthy: response.status === 200,
        statusCode: response.status,
        responseTime,
        body,
        timestamp: Date.now(),
      };
      
    } catch (error) {
      return {
        healthy: false,
        statusCode: 0,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }
  
  /**
   * 等待实例健康
   */
  private async waitForHealthy(instance: Instance, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await this.healthCheck(instance);
      if (result.healthy) {
        return;
      }
      await this.sleep(1000);
    }
    
    throw new Error(`Timeout waiting for instance ${instance.name} to become healthy`);
  }
  
  /**
   * 启动回滚监控
   */
  private startRollbackMonitor(): void {
    // 清理旧的历史记录
    const cutoff = Date.now() - this.config.rollbackWindow;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
    
    // 启动监控定时器
    this.rollbackTimer = setInterval(() => {
      const errorRate = this.calculateErrorRate();
      
      if (errorRate > this.config.rollbackThreshold) {
        this.emit('rollback:triggered', { errorRate, threshold: this.config.rollbackThreshold });
        this.rollback().catch(() => {});
      }
    }, 5000);
  }
  
  /**
   * 计算错误率
   */
  private calculateErrorRate(): number {
    const cutoff = Date.now() - this.config.rollbackWindow;
    const recentRequests = this.requestHistory.filter(r => r.timestamp > cutoff);
    
    if (recentRequests.length === 0) return 0;
    
    const failedRequests = recentRequests.filter(r => !r.success);
    return failedRequests.length / recentRequests.length;
  }
  
  /**
   * 记录请求结果
   */
  recordRequest(success: boolean): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      success,
    });
    
    // 保持历史记录在合理大小
    if (this.requestHistory.length > 10000) {
      this.requestHistory = this.requestHistory.slice(-5000);
    }
  }
  
  /**
   * 获取活跃实例
   */
  getActiveInstance(): Instance {
    return this[this.active]!;
  }
  
  /**
   * 获取实例
   */
  getInstance(name: 'blue' | 'green'): Instance | undefined {
    return this[name];
  }
  
  /**
   * 获取当前切换状态
   */
  getSwitchState(): SwitchState {
    return this.switchState;
  }
  
  /**
   * 获取指标
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }
  
  /**
   * 是否正在切换中
   */
  isSwitching(): boolean {
    return this.switchState !== SwitchState.IDLE;
  }
  
  /**
   * 获取当前切换
   */
  getCurrentSwitch(): SwitchResult | undefined {
    return this.currentSwitch ? { ...this.currentSwitch } : undefined;
  }
  
  /**
   * 关闭
   */
  async shutdown(): Promise<void> {
    // 停止所有健康检查
    for (const [id, timer] of this.healthCheckTimers) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();
    
    if (this.rollbackTimer) {
      clearInterval(this.rollbackTimer);
    }
    
    this.emit('shutdown');
  }
  
  /**
   * 延迟工具
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建蓝绿管理器
 */
export function createBlueGreenManager(config?: Partial<HotSwapConfig>): BlueGreenManager {
  return new BlueGreenManager(config);
}

/**
 * 快速切换辅助函数
 */
export async function quickSwitch(
  manager: BlueGreenManager,
  newVersion: string,
  options?: {
    onProgress?: (state: SwitchState) => void;
    onError?: (error: Error) => void;
  }
): Promise<SwitchResult> {
  // 监听进度
  if (options?.onProgress) {
    manager.on('switch:started', () => options.onProgress!(SwitchState.PREPARING));
    manager.on('switch:warming', () => options.onProgress!(SwitchState.WARMING_UP));
    manager.on('switch:performing', () => options.onProgress!(SwitchState.SWITCHING));
    manager.on('switch:verifying', () => options.onProgress!(SwitchState.VERIFYING));
  }
  
  if (options?.onError) {
    manager.on('switch:failed', (error) => options.onError!(error));
  }
  
  return manager.switch(newVersion);
}

// 默认导出
export default {
  BlueGreenManager,
  createBlueGreenManager,
  quickSwitch,
  defaultHotSwapConfig,
  InstanceStatus,
  SwitchState,
};
