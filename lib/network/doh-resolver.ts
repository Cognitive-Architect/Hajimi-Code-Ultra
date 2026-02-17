/**
 * DoH预解析层 - TLS-PINNING-ENHANCE B-03/03
 * HAJIMI-TLS-PINNING
 * 
 * DNS-over-HTTPS解析，绕过系统DNS
 * 
 * @module lib/network/doh-resolver
 * @author 唐音 (Engineer)
 */

import { EventEmitter } from 'events';
import * as https from 'https';

// Cloudflare DoH端点
const DOH_ENDPOINTS = [
  'https://cloudflare-dns.com/dns-query',
  'https://1.1.1.1/dns-query',
];

// 硬编码IP池（与DoH结果交叉验证）
const HARD_CODED_IPS = [
  '104.21.63.51',
  '104.21.63.52',
  '104.21.63.53',
  '172.67.139.30',
];

export interface DNSAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DNSResponse {
  Status: number;
  TC: boolean;
  RD: boolean;
  RA: boolean;
  AD: boolean;
  CD: boolean;
  Question: Array<{ name: string; type: number }>;
  Answer?: DNSAnswer[];
}

export interface CachedRecord {
  ips: string[];
  expiresAt: number;
  ttl: number;
}

/**
 * DoH解析器
 */
export class DoHResolver extends EventEmitter {
  private cache: Map<string, CachedRecord> = new Map();
  private defaultTTL = 300; // 5分钟
  private currentEndpointIndex = 0;

  /**
   * 解析域名
   * 
   * 自测: SEC-007 DoH解析成功<200ms
   * 自测: SEC-008 缓存命中
   * 自测: SEC-009 DoH被墙时降级
   */
  async resolve(hostname: string): Promise<string[]> {
    // 检查缓存
    const cached = this.cache.get(hostname);
    if (cached && Date.now() < cached.expiresAt) {
      this.emit('resolve:cache_hit', { hostname, ips: cached.ips });
      return cached.ips;
    }

    // 尝试DoH解析
    try {
      const ips = await this.queryDoH(hostname);
      
      // 交叉验证
      const validated = this.crossValidate(ips);
      
      // 缓存结果
      this.cache.set(hostname, {
        ips: validated,
        expiresAt: Date.now() + this.defaultTTL * 1000,
        ttl: this.defaultTTL,
      });

      this.emit('resolve:success', { hostname, ips: validated, source: 'doh' });
      return validated;
      
    } catch (error) {
      this.emit('resolve:doh_failed', { hostname, error });
      
      // 降级到系统DNS
      return this.fallbackToSystemDNS(hostname);
    }
  }

  /**
   * DoH查询
   */
  private async queryDoH(hostname: string): Promise<string[]> {
    const endpoint = DOH_ENDPOINTS[this.currentEndpointIndex];
    
    const url = new URL(endpoint);
    url.searchParams.append('name', hostname);
    url.searchParams.append('type', 'A');
    url.searchParams.append('ct', 'application/dns-json');

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const options: https.RequestOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Accept': 'application/dns-json',
          'User-Agent': 'HAJIMI-DOH/1.0',
        },
        timeout: 2000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const latency = Date.now() - startTime;
          
          try {
            const response: DNSResponse = JSON.parse(data);
            
            if (response.Status !== 0) {
              reject(new Error(`DNS error status: ${response.Status}`));
              return;
            }

            const ips = (response.Answer || [])
              .filter(a => a.type === 1) // A记录
              .map(a => a.data);

            this.emit('doh:response', { latency, answerCount: ips.length });
            resolve(ips);
            
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        // 切换备用DoH端点
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % DOH_ENDPOINTS.length;
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('DoH timeout'));
      });

      req.end();
    });
  }

  /**
   * 交叉验证
   * 
   * DoH返回的IP必须与硬编码IP池有交集
   */
  private crossValidate(ips: string[]): string[] {
    const intersection = ips.filter(ip => HARD_CODED_IPS.includes(ip));
    
    if (intersection.length === 0) {
      // 无交集，可能DoH响应被污染
      this.emit('validate:cross_failed', { 
        doh_ips: ips, 
        hardcoded: HARD_CODED_IPS 
      });
      
      // 返回硬编码IP作为保守选择
      return HARD_CODED_IPS.slice(0, 3);
    }

    return intersection;
  }

  /**
   * 降级到系统DNS
   */
  private async fallbackToSystemDNS(hostname: string): Promise<string[]> {
    const dns = require('dns').promises;
    
    try {
      const addresses = await dns.resolve4(hostname);
      
      // 与硬编码交叉验证
      const validated = this.crossValidate(addresses);
      
      this.emit('resolve:fallback', { hostname, ips: validated, source: 'system_dns' });
      return validated;
      
    } catch {
      // 完全降级到硬编码
      this.emit('resolve:hardcoded', { hostname, ips: HARD_CODED_IPS });
      return HARD_CODED_IPS;
    }
  }

  /**
   * 预解析（并行多个域名）
   */
  async prefetch(hostnames: string[]): Promise<void> {
    await Promise.all(hostnames.map(h => this.resolve(h)));
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.emit('cache:cleared');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    entries: Array<{ hostname: string; expiresIn: number }>;
  } {
    const now = Date.now();
    const entries: Array<{ hostname: string; expiresIn: number }> = [];
    
    for (const [hostname, record] of this.cache) {
      entries.push({
        hostname,
        expiresIn: Math.ceil((record.expiresAt - now) / 1000),
      });
    }

    return {
      size: this.cache.size,
      hitRate: 0, // 需要外部统计
      entries,
    };
  }
}

export const dohResolver = new DoHResolver();
export default DoHResolver;
