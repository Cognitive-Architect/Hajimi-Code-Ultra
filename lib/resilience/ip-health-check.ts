/**
 * IP 健康检查器
 * HAJIMI-OR-IPDIRECT
 * 
 * TCP探测和HTTP探活，自动故障转移
 * 
 * @module lib/resilience/ip-health-check
 * @author 压力怪 (Audit) - B-05/09
 */

import * as net from 'net';
import * as https from 'https';
import { EventEmitter } from 'events';

// ============================================================================
// 类型定义
// ============================================================================

export interface IPHealthState {
  ip: string;
  isHealthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  averageLatencyMs: number;
  totalChecks: number;
  failureRate: number;
}

export interface HealthCheckOptions {
  /** TCP连接超时 (ms) */
  tcpTimeoutMs: number;
  /** HTTP请求超时 (ms) */
  httpTimeoutMs: number;
  /** 检查间隔 (ms) */
  intervalMs: number;
  /** 连续失败阈值 */
  failureThreshold: number;
  /** 连续成功阈值（用于恢复） */
  successThreshold: number;
  /** 启用HTTP探活 */
  enableHttpProbe: boolean;
}

export interface ProbeResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
}

// ============================================================================
// IP 健康检查器
// ============================================================================

export class IPHealthChecker extends EventEmitter {
  private states: Map<string, IPHealthState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private options: Required<HealthCheckOptions>;

  constructor(options?: Partial<HealthCheckOptions>) {
    super();
    this.options = {
      tcpTimeoutMs: 5000,
      httpTimeoutMs: 10000,
      intervalMs: 30000,
      failureThreshold: 3,
      successThreshold: 2,
      enableHttpProbe: true,
      ...options,
    };
  }

  // ========================================================================
  // IP 管理
  // ========================================================================

  /**
   * 注册IP到健康检查
   */
  registerIP(ip: string): void {
    if (this.states.has(ip)) {
      return;
    }

    const state: IPHealthState = {
      ip,
      isHealthy: true, // 初始状态假设健康
      lastChecked: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      averageLatencyMs: 0,
      totalChecks: 0,
      failureRate: 0,
    };

    this.states.set(ip, state);
    
    // 立即执行首次检查
    this.checkIP(ip);
    
    // 启动定时检查
    const timer = setInterval(() => this.checkIP(ip), this.options.intervalMs);
    this.timers.set(ip, timer);

    console.log(`[OR-HEALTH] Registered IP: ${ip}`);
  }

  /**
   * 注销IP
   */
  unregisterIP(ip: string): void {
    const timer = this.timers.get(ip);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(ip);
    }
    this.states.delete(ip);
    console.log(`[OR-HEALTH] Unregistered IP: ${ip}`);
  }

  /**
   * 批量注册
   */
  registerIPs(ips: string[]): void {
    for (const ip of ips) {
      this.registerIP(ip);
    }
  }

  // ========================================================================
  // 健康检查
  // ========================================================================

  private async checkIP(ip: string): Promise<void> {
    const state = this.states.get(ip);
    if (!state) return;

    const startTime = Date.now();
    
    // TCP 探测
    const tcpResult = await this.tcpProbe(ip);
    
    let httpResult: ProbeResult | undefined;
    if (this.options.enableHttpProbe && tcpResult.success) {
      httpResult = await this.httpProbe(ip);
    }

    const latencyMs = Date.now() - startTime;
    const overallSuccess = tcpResult.success && (!httpResult || httpResult.success);

    // 更新状态
    this.updateState(state, overallSuccess, latencyMs);
    
    // 发出事件
    this.emit('check', {
      ip,
      success: overallSuccess,
      latencyMs,
      tcp: tcpResult,
      http: httpResult,
    });

    // 状态变更事件
    if (!overallSuccess && state.isHealthy && state.consecutiveFailures >= this.options.failureThreshold) {
      state.isHealthy = false;
      this.emit('unhealthy', { ip, state, lastError: tcpResult.error || httpResult?.error });
      console.log(`[OR-HEALTH] IP ${ip} marked UNHEALTHY`);
    }

    if (overallSuccess && !state.isHealthy && state.consecutiveSuccesses >= this.options.successThreshold) {
      state.isHealthy = true;
      this.emit('healthy', { ip, state });
      console.log(`[OR-HEALTH] IP ${ip} recovered to HEALTHY`);
    }
  }

  private updateState(state: IPHealthState, success: boolean, latencyMs: number): void {
    state.lastChecked = new Date();
    state.totalChecks++;

    if (success) {
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;
    }

    // 更新平均延迟（指数移动平均）
    const alpha = 0.3;
    state.averageLatencyMs = 
      state.averageLatencyMs === 0 
        ? latencyMs 
        : state.averageLatencyMs * (1 - alpha) + latencyMs * alpha;

    // 计算失败率
    const recentFailures = success ? 0 : 1; // 简化计算
    state.failureRate = state.failureRate * 0.9 + recentFailures * 0.1;
  }

  // ========================================================================
  // 探测实现
  // ========================================================================

  private tcpProbe(ip: string): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      
      socket.setTimeout(this.options.tcpTimeoutMs);
      
      socket.on('connect', () => {
        const latencyMs = Date.now() - startTime;
        socket.destroy();
        resolve({ success: true, latencyMs });
      });
      
      socket.on('error', (err) => {
        resolve({ 
          success: false, 
          latencyMs: Date.now() - startTime,
          error: err.message 
        });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ 
          success: false, 
          latencyMs: Date.now() - startTime,
          error: 'TCP probe timeout' 
        });
      });
      
      socket.connect(443, ip);
    });
  }

  private httpProbe(ip: string): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const options: https.RequestOptions = {
        hostname: ip,
        port: 443,
        path: '/api/v1/models',
        method: 'GET',
        headers: {
          'Host': 'api.openrouter.ai',
        },
        timeout: this.options.httpTimeoutMs,
        // 允许自签名证书（仅用于健康检查）
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        const latencyMs = Date.now() - startTime;
        
        // 任何 2xx 或 4xx（除5xx外）都表示服务正常
        const isSuccess = res.statusCode !== undefined && res.statusCode < 500;
        
        res.on('data', () => {}); // 消费数据
        res.on('end', () => {
          resolve({ 
            success: isSuccess, 
            latencyMs,
            httpStatus: res.statusCode || undefined
          });
        });
      });

      req.on('error', (err) => {
        resolve({ 
          success: false, 
          latencyMs: Date.now() - startTime,
          error: err.message 
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ 
          success: false, 
          latencyMs: Date.now() - startTime,
          error: 'HTTP probe timeout' 
        });
      });

      req.end();
    });
  }

  // ========================================================================
  // 查询方法
  // ========================================================================

  /**
   * 获取所有健康IP
   */
  getHealthyIPs(): string[] {
    return Array.from(this.states.values())
      .filter(s => s.isHealthy)
      .map(s => s.ip);
  }

  /**
   * 获取所有不健康IP
   */
  getUnhealthyIPs(): string[] {
    return Array.from(this.states.values())
      .filter(s => !s.isHealthy)
      .map(s => s.ip);
  }

  /**
   * 获取IP状态
   */
  getState(ip: string): IPHealthState | undefined {
    return this.states.get(ip);
  }

  /**
   * 获取所有状态
   */
  getAllStates(): IPHealthState[] {
    return Array.from(this.states.values());
  }

  /**
   * 选择最优IP（延迟最低的健康IP）
   */
  selectBestIP(): string | undefined {
    const healthy = this.getHealthyIPs();
    if (healthy.length === 0) return undefined;

    // 按延迟排序
    const sorted = healthy
      .map(ip => this.states.get(ip)!)
      .sort((a, b) => a.averageLatencyMs - b.averageLatencyMs);

    return sorted[0]?.ip;
  }

  /**
   * 强制立即检查指定IP
   */
  async forceCheck(ip: string): Promise<boolean> {
    if (!this.states.has(ip)) {
      throw new Error(`IP ${ip} not registered`);
    }
    await this.checkIP(ip);
    return this.states.get(ip)!.isHealthy;
  }

  // ========================================================================
  // 统计
  // ========================================================================

  getStatistics(): {
    totalIPs: number;
    healthyCount: number;
    unhealthyCount: number;
    averageLatency: number;
    overallHealthRate: number;
  } {
    const states = this.getAllStates();
    const healthy = states.filter(s => s.isHealthy);
    
    return {
      totalIPs: states.length,
      healthyCount: healthy.length,
      unhealthyCount: states.length - healthy.length,
      averageLatency: states.reduce((sum, s) => sum + s.averageLatencyMs, 0) / states.length || 0,
      overallHealthRate: states.length > 0 ? healthy.length / states.length : 0,
    };
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.states.clear();
    this.removeAllListeners();
  }
}

export default IPHealthChecker;
