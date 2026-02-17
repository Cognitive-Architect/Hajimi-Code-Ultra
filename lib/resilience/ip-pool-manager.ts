/**
 * IP池自动化管理器 - DEBT-OR-003 清偿
 * HAJIMI-DEBT-CLEARANCE
 * 
 * Cloudflare边缘节点自动发现、健康检查、最优选择
 * 
 * @module lib/resilience/ip-pool-manager
 * @author 黄瓜睦 (Architect) - B-03/09
 */

import { EventEmitter } from 'events';
import * as https from 'https';
import * as net from 'net';

export interface IPEntry {
  ip: string;
  region: string;
  latency: number;
  successRate: number;
  lastChecked: Date;
  consecutiveFailures: number;
  isHealthy: boolean;
}

export interface IPPoolConfig {
  autoUpdateInterval: number; // 毫秒
  healthCheckInterval: number;
  failureThreshold: number;
  latencyTimeout: number;
}

/**
 * IP池自动化管理器
 */
export class IPPoolManager extends EventEmitter {
  private ipPool: Map<string, IPEntry> = new Map();
  private config: IPPoolConfig;
  private updateTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config?: Partial<IPPoolConfig>) {
    super();
    this.config = {
      autoUpdateInterval: 90 * 24 * 60 * 60 * 1000, // 90天 (季度)
      healthCheckInterval: 30000, // 30秒
      failureThreshold: 3,
      latencyTimeout: 5000,
      ...config,
    };
    
    this.loadDefaultIPs();
  }

  /**
   * 加载默认IP池
   */
  private loadDefaultIPs(): void {
    const defaultIPs = [
      { ip: '104.21.63.51', region: 'US-West' },
      { ip: '104.21.63.52', region: 'US-West' },
      { ip: '172.67.139.30', region: 'US-East' },
      { ip: '104.21.32.1', region: 'EU' },
    ];

    for (const { ip, region } of defaultIPs) {
      this.ipPool.set(ip, {
        ip,
        region,
        latency: 0,
        successRate: 1.0,
        lastChecked: new Date(),
        consecutiveFailures: 0,
        isHealthy: true,
      });
    }
  }

  /**
   * 自动更新IP池
   * 
   * 自测: DEBT-003-001 季度自动更新
   */
  async updateIPPool(): Promise<void> {
    try {
      // 获取Cloudflare IP段
      const cloudflareIPs = await this.fetchCloudflareIPs();
      
      // 探测可用IP
      const availableIPs = await this.probeIPs(cloudflareIPs);
      
      // 更新池
      this.mergeIPPool(availableIPs);
      
      this.emit('update:complete', {
        timestamp: new Date(),
        totalIPs: this.ipPool.size,
        healthyIPs: this.getHealthyIPs().length,
      });
    } catch (error) {
      this.emit('update:error', error);
    }
  }

  /**
   * 获取Cloudflare IP列表
   */
  private async fetchCloudflareIPs(): Promise<string[]> {
    // Cloudflare官方IP列表API
    const urls = [
      'https://www.cloudflare.com/ips-v4/',
    ];

    const ips: string[] = [];
    
    for (const url of urls) {
      try {
        const response = await this.httpGet(url);
        const lines = response.split('\n');
        
        for (const line of lines) {
          const cidr = line.trim();
          if (cidr && !cidr.startsWith('#')) {
            // 展开CIDR为IP列表（简化：只取前几个）
            const expanded = this.expandCIDR(cidr, 5);
            ips.push(...expanded);
          }
        }
      } catch {
        // 忽略单个失败
      }
    }

    return ips;
  }

  /**
   * 展开CIDR
   */
  private expandCIDR(cidr: string, limit: number): string[] {
    const [ip, mask] = cidr.split('/');
    if (!mask) return [ip];

    const maskBits = parseInt(mask);
    if (maskBits > 24) return [ip]; // /24以上不展开

    const parts = ip.split('.').map(Number);
    const ips: string[] = [];
    
    // 简化：只取网段内的前几个IP
    for (let i = 1; i <= limit && i < 256; i++) {
      ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`);
    }

    return ips;
  }

  /**
   * 探测IP可用性
   */
  private async probeIPs(ips: string[]): Promise<Array<Partial<IPEntry>>> {
    const results: Array<Partial<IPEntry>> = [];
    
    // 并发探测（限制并发数）
    const batchSize = 10;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(ip => this.probeSingleIP(ip))
      );
      results.push(...batchResults.filter(r => r !== null) as IPEntry[]);
    }

    return results;
  }

  /**
   * 探测单个IP
   */
  private async probeSingleIP(ip: string): Promise<Partial<IPEntry> | null> {
    const startTime = Date.now();
    
    try {
      await this.tcpConnect(ip, 443, this.config.latencyTimeout);
      const latency = Date.now() - startTime;
      
      return {
        ip,
        latency,
        isHealthy: true,
        lastChecked: new Date(),
      };
    } catch {
      return {
        ip,
        latency: -1,
        isHealthy: false,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * TCP连接测试
   */
  private tcpConnect(ip: string, port: number, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Timeout'));
      });
      
      socket.connect(port, ip);
    });
  }

  /**
   * 合并IP池
   */
  private mergeIPPool(newEntries: Array<Partial<IPEntry>>): void {
    for (const entry of newEntries) {
      if (!entry.ip) continue;
      
      const existing = this.ipPool.get(entry.ip);
      if (existing) {
        // 更新现有记录
        existing.latency = entry.latency || existing.latency;
        existing.isHealthy = entry.isHealthy ?? existing.isHealthy;
        existing.lastChecked = entry.lastChecked || new Date();
      } else if (entry.isHealthy) {
        // 添加新IP
        this.ipPool.set(entry.ip, {
          ip: entry.ip,
          region: 'unknown',
          latency: entry.latency || 0,
          successRate: 1.0,
          lastChecked: new Date(),
          consecutiveFailures: 0,
          isHealthy: true,
        });
      }
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck(): void {
    this.checkAllIPs();
    this.healthCheckTimer = setInterval(() => {
      this.checkAllIPs();
    }, this.config.healthCheckInterval);
  }

  /**
   * 检查所有IP
   */
  private async checkAllIPs(): Promise<void> {
    const checks = Array.from(this.ipPool.values()).map(async (entry) => {
      const startTime = Date.now();
      
      try {
        await this.tcpConnect(entry.ip, 443, this.config.latencyTimeout);
        entry.latency = Date.now() - startTime;
        entry.consecutiveFailures = 0;
        entry.isHealthy = true;
        entry.successRate = Math.min(1, entry.successRate + 0.1);
      } catch {
        entry.consecutiveFailures++;
        entry.successRate = Math.max(0, entry.successRate - 0.2);
        
        if (entry.consecutiveFailures >= this.config.failureThreshold) {
          entry.isHealthy = false;
          this.emit('ip:unhealthy', entry);
        }
      }
      
      entry.lastChecked = new Date();
    });

    await Promise.all(checks);
  }

  /**
   * 获取最优IP
   * 
   * 自测: DEBT-003-002 延迟最优IP自动选择
   */
  getOptimalIP(): string | null {
    const healthy = this.getHealthyIPs();
    if (healthy.length === 0) return null;

    // 按延迟排序
    healthy.sort((a, b) => a.latency - b.latency);
    
    // 返回延迟最低的IP
    return healthy[0].ip;
  }

  /**
   * 获取健康IP列表
   */
  getHealthyIPs(): IPEntry[] {
    return Array.from(this.ipPool.values())
      .filter(ip => ip.isHealthy);
  }

  /**
   * 剔除失效IP
   * 
   * 自测: DEBT-003-003 失效IP自动剔除<30秒
   */
  purgeUnhealthyIPs(): number {
    let removed = 0;
    const now = Date.now();
    
    for (const [ip, entry] of this.ipPool) {
      // 30秒内未通过健康检查则剔除
      if (!entry.isHealthy && 
          now - entry.lastChecked.getTime() > 30000) {
        this.ipPool.delete(ip);
        removed++;
        this.emit('ip:removed', entry);
      }
    }

    return removed;
  }

  /**
   * 启动自动更新
   */
  startAutoUpdate(): void {
    this.updateIPPool();
    this.updateTimer = setInterval(() => {
      this.updateIPPool();
    }, this.config.autoUpdateInterval);
  }

  /**
   * HTTP GET请求
   */
  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  dispose(): void {
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.removeAllListeners();
  }
}

export default IPPoolManager;
