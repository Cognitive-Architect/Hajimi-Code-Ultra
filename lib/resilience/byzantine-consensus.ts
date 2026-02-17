/**
 * 多IP拜占庭共识 - TLS-PINNING-ENHANCE B-02/03
 * HAJIMI-TLS-PINNING
 * 
 * 3IP交叉验证，2/3多数决防BGP劫持
 * 
 * @module lib/resilience/byzantine-consensus
 * @author 黄瓜睦 (Architect)
 */

import { EventEmitter } from 'events';
import * as https from 'https';
import * as crypto from 'crypto';
import { CertificatePinning } from '../security/certificate-pinning';

export interface ConsensusConfig {
  ips: string[];
  quorum: number; // 2 for 2/3
  timeout: number;
  maxRetries: number;
  blacklistDuration: number;
}

export interface ConsensusResult {
  success: boolean;
  agreedIP: string | null;
  responseHash: string | null;
  participatingIPs: string[];
  dissentingIPs: string[];
  latency: number;
}

export interface IPVote {
  ip: string;
  response: string;
  hash: string;
  latency: number;
  valid: boolean;
}

/**
 * 拜占庭共识管理器
 */
export class ByzantineConsensus extends EventEmitter {
  private config: ConsensusConfig;
  private pinning: CertificatePinning;
  private blacklist: Map<string, number> = new Map(); // IP -> 解禁时间

  constructor(
    pinning: CertificatePinning,
    config?: Partial<ConsensusConfig>
  ) {
    super();
    this.pinning = pinning;
    this.config = {
      ips: ['104.21.63.51', '104.21.63.52', '104.21.63.53'],
      quorum: 2,
      timeout: 3000,
      maxRetries: 2,
      blacklistDuration: 30 * 60 * 1000, // 30分钟
      ...config,
    };
  }

  /**
   * 执行共识验证
   * 
   * 自测: SEC-004 3IP共识达成<500ms
   * 自测: SEC-005 1IP作恶识别
   * 自测: SEC-006 2IP挂掉时降级
   */
  async reachConsensus(
    path: string,
    method: string = 'GET',
    data?: unknown
  ): Promise<ConsensusResult> {
    const startTime = Date.now();
    
    // 过滤黑名单IP
    const availableIPs = this.getAvailableIPs();
    
    if (availableIPs.length < this.config.quorum) {
      // 不足法定人数，降级到单IP
      this.emit('consensus:degraded', {
        reason: 'insufficient_ips',
        available: availableIPs.length,
        required: this.config.quorum,
      });
      
      return this.fallbackToSingleIP(availableIPs[0], path, method, data);
    }

    // 并发请求所有可用IP
    const votes = await this.queryAllIPs(availableIPs, path, method, data);

    // 统计响应哈希
    const hashGroups = this.groupByHash(votes);
    
    // 找多数派
    const majority = this.findMajority(hashGroups);
    
    if (majority) {
      // 标记异常IP
      this.identifyDissenters(votes, majority.hash);
      
      const latency = Date.now() - startTime;
      
      this.emit('consensus:success', {
        hash: majority.hash,
        votes: majority.count,
        total: votes.length,
        latency,
      });

      return {
        success: true,
        agreedIP: majority.representativeIP,
        responseHash: majority.hash,
        participatingIPs: votes.filter(v => v.valid).map(v => v.ip),
        dissentingIPs: votes.filter(v => v.valid && v.hash !== majority.hash).map(v => v.ip),
        latency,
      };
    }

    // 未达成共识，降级
    return this.fallbackToSingleIP(availableIPs[0], path, method, data);
  }

  /**
   * 并发查询所有IP
   */
  private async queryAllIPs(
    ips: string[],
    path: string,
    method: string,
    data?: unknown
  ): Promise<IPVote[]> {
    const queries = ips.map(ip => this.querySingleIP(ip, path, method, data));
    const results = await Promise.allSettled(queries);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          ip: ips[index],
          response: '',
          hash: '',
          latency: -1,
          valid: false,
        };
      }
    });
  }

  /**
   * 查询单个IP
   */
  private async querySingleIP(
    ip: string,
    path: string,
    method: string,
    data?: unknown
  ): Promise<IPVote> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const postData = data ? JSON.stringify(data) : '';
      
      const options: https.RequestOptions = {
        hostname: ip,
        port: 443,
        path,
        method,
        headers: {
          'Host': 'api.openrouter.ai',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        agent: new https.Agent({
          rejectUnauthorized: false, // 使用证书固定替代
          servername: 'api.openrouter.ai',
          checkServerIdentity: this.pinning.createCheckCallback(),
        }),
        timeout: this.config.timeout,
      };

      const req = https.request(options, (res) => {
        let response = '';
        res.on('data', chunk => response += chunk);
        res.on('end', () => {
          const latency = Date.now() - startTime;
          
          resolve({
            ip,
            response,
            hash: crypto.createHash('sha256').update(response).digest('hex'),
            latency,
            valid: res.statusCode === 200,
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * 按哈希分组
   */
  private groupByHash(votes: IPVote[]): Map<string, IPVote[]> {
    const groups = new Map<string, IPVote[]>();
    
    for (const vote of votes) {
      if (!vote.valid || !vote.hash) continue;
      
      const group = groups.get(vote.hash) || [];
      group.push(vote);
      groups.set(vote.hash, group);
    }
    
    return groups;
  }

  /**
   * 找多数派
   */
  private findMajority(groups: Map<string, IPVote[]>): {
    hash: string;
    count: number;
    representativeIP: string;
  } | null {
    for (const [hash, votes] of groups) {
      if (votes.length >= this.config.quorum) {
        return {
          hash,
          count: votes.length,
          representativeIP: votes[0].ip,
        };
      }
    }
    return null;
  }

  /**
   * 识别并处理异常IP
   */
  private identifyDissenters(votes: IPVote[], majorityHash: string): void {
    for (const vote of votes) {
      if (vote.valid && vote.hash !== majorityHash) {
        // 加入黑名单
        this.blacklist.set(vote.ip, Date.now() + this.config.blacklistDuration);
        
        this.emit('ip:blacklisted', {
          ip: vote.ip,
          reason: 'consensus_dissent',
          expectedHash: majorityHash,
          actualHash: vote.hash,
          cooldownMinutes: 30,
        });
      }
    }
  }

  /**
   * 获取可用IP列表
   */
  private getAvailableIPs(): string[] {
    const now = Date.now();
    return this.config.ips.filter(ip => {
      const bannedUntil = this.blacklist.get(ip);
      if (!bannedUntil) return true;
      if (now > bannedUntil) {
        this.blacklist.delete(ip);
        return true;
      }
      return false;
    });
  }

  /**
   * 降级到单IP
   */
  private async fallbackToSingleIP(
    ip: string | undefined,
    path: string,
    method: string,
    data?: unknown
  ): Promise<ConsensusResult> {
    if (!ip) {
      return {
        success: false,
        agreedIP: null,
        responseHash: null,
        participatingIPs: [],
        dissentingIPs: [],
        latency: -1,
      };
    }

    this.emit('consensus:fallback', { ip, reason: 'no_quorum' });

    try {
      const vote = await this.querySingleIP(ip, path, method, data);
      
      return {
        success: vote.valid,
        agreedIP: ip,
        responseHash: vote.hash,
        participatingIPs: vote.valid ? [ip] : [],
        dissentingIPs: [],
        latency: vote.latency,
      };
    } catch {
      return {
        success: false,
        agreedIP: null,
        responseHash: null,
        participatingIPs: [],
        dissentingIPs: [],
        latency: -1,
      };
    }
  }

  /**
   * 手动清理黑名单
   */
  clearBlacklist(): void {
    this.blacklist.clear();
    this.emit('blacklist:cleared', { timestamp: Date.now() });
  }

  /**
   * 获取黑名单状态
   */
  getBlacklist(): Array<{ ip: string; cooldownMinutes: number }> {
    const now = Date.now();
    const result: Array<{ ip: string; cooldownMinutes: number }> = [];
    
    for (const [ip, until] of this.blacklist) {
      const remaining = Math.ceil((until - now) / 60000);
      if (remaining > 0) {
        result.push({ ip, cooldownMinutes: remaining });
      }
    }
    
    return result;
  }
}

export default ByzantineConsensus;
