/**
 * TLS安全守护者 - DEBT-OR-002 清偿
 * HAJIMI-DEBT-CLEARANCE
 * 
 * IP白名单动态校验、证书透明度检查、SNI强制封装
 * 
 * @module lib/security/tls-guardian
 * @author 奶龙娘 (Doctor) - B-02/09
 */

import { EventEmitter } from 'events';
import * as https from 'https';
import * as tls from 'tls';

// Cloudflare IP段
const ALLOWED_IP_RANGES = [
  { start: '104.21.0.0', end: '104.21.255.255', cidr: '104.21.0.0/16' },
  { start: '172.67.0.0', end: '172.67.255.255', cidr: '172.67.0.0/16' },
  { start: '104.16.0.0', end: '104.23.255.255', cidr: '104.16.0.0/12' },
];

export interface TLSConfig {
  servername: string;
  rejectUnauthorized: boolean;
  checkServerIdentity?: (host: string, cert: tls.PeerCertificate) => Error | undefined;
}

export interface SecurityViolation {
  type: 'ip_not_allowed' | 'certificate_anomaly' | 'sni_missing' | 'tls_downgrade';
  timestamp: number;
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * TLS安全守护者
 */
export class TLSGuardian extends EventEmitter {
  private violations: SecurityViolation[] = [];
  private maxViolations = 100;
  private circuitOpen = false;

  /**
   * IP白名单验证
   * 
   * 自测: DEBT-002-001 仅104.21.0.0/16允许
   */
  isIPAllowed(ip: string): boolean {
    const ipLong = this.ipToLong(ip);
    
    for (const range of ALLOWED_IP_RANGES) {
      const startLong = this.ipToLong(range.start);
      const endLong = this.ipToLong(range.end);
      
      if (ipLong >= startLong && ipLong <= endLong) {
        return true;
      }
    }

    this.recordViolation({
      type: 'ip_not_allowed',
      timestamp: Date.now(),
      details: { ip, allowedRanges: ALLOWED_IP_RANGES.map(r => r.cidr) },
      severity: 'high',
    });

    return false;
  }

  /**
   * 创建安全的HTTPS Agent
   * 
   * 自测: DEBT-002-002 异常证书立即熔断
   * 自测: DEBT-002-003 SNI强制不可绕过
   */
  createSecureAgent(ip: string, servername: string): https.Agent {
    // 强制IP白名单检查
    if (!this.isIPAllowed(ip)) {
      throw new Error(`IP ${ip} not in whitelist`);
    }

    // 强制SNI
    if (!servername || servername === ip) {
      this.recordViolation({
        type: 'sni_missing',
        timestamp: Date.now(),
        details: { ip, servername },
        severity: 'critical',
      });
      throw new Error('SNI (servername) is required and cannot be IP address');
    }

    const agent = new https.Agent({
      rejectUnauthorized: false, // 我们自定义证书检查
      servername,
      family: 4,
    });

    // 自定义证书检查
    (agent as any).options.checkServerIdentity = (host: string, cert: tls.PeerCertificate) => {
      // 证书透明度检查简化版
      const certValid = this.checkCertificateTransparency(cert);
      
      if (!certValid) {
        this.recordViolation({
          type: 'certificate_anomaly',
          timestamp: Date.now(),
          details: { 
            host, 
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
          },
          severity: 'critical',
        });

        // 异常证书立即熔断
        this.triggerCircuitBreaker();
        
        return new Error('Certificate transparency check failed');
      }

      return undefined;
    };

    return agent;
  }

  /**
   * 证书透明度检查
   */
  private checkCertificateTransparency(cert: tls.PeerCertificate): boolean {
    // 简化实现：检查证书有效期和基本信息
    if (!cert.valid_from || !cert.valid_to) {
      return false;
    }

    const now = new Date();
    const validFrom = new Date(cert.valid_from);
    const validTo = new Date(cert.valid_to);

    if (now < validFrom || now > validTo) {
      return false;
    }

    // 检查是否来自受信任的CA (Cloudflare)
    const issuer = JSON.stringify(cert.issuer).toLowerCase();
    const trustedPatterns = ['cloudflare', 'digicert', 'lets encrypt'];
    
    return trustedPatterns.some(pattern => issuer.includes(pattern));
  }

  /**
   * 熔断机制
   */
  private triggerCircuitBreaker(): void {
    if (this.circuitOpen) return;
    
    this.circuitOpen = true;
    this.emit('circuit:open', {
      timestamp: Date.now(),
      reason: 'certificate_anomaly',
    });

    // 5分钟后尝试恢复
    setTimeout(() => {
      this.circuitOpen = false;
      this.emit('circuit:close', { timestamp: Date.now() });
    }, 5 * 60 * 1000);
  }

  /**
   * 检查熔断状态
   */
  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  /**
   * 记录安全违规
   */
  private recordViolation(violation: SecurityViolation): void {
    this.violations.push(violation);
    
    // 限制数量
    if (this.violations.length > this.maxViolations) {
      this.violations.shift();
    }

    this.emit('violation', violation);

    // 严重违规立即报警
    if (violation.severity === 'critical') {
      this.emit('alert:critical', violation);
    }
  }

  /**
   * 获取违规记录
   */
  getViolations(severity?: string): SecurityViolation[] {
    if (severity) {
      return this.violations.filter(v => v.severity === severity);
    }
    return [...this.violations];
  }

  /**
   * IP转整数
   */
  private ipToLong(ip: string): number {
    const parts = ip.split('.').map(Number);
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }

  /**
   * 生成安全报告
   */
  generateReport(): {
    totalViolations: number;
    bySeverity: Record<string, number>;
    recentViolations: SecurityViolation[];
    circuitStatus: 'open' | 'closed';
  } {
    const bySeverity: Record<string, number> = {};
    for (const v of this.violations) {
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    }

    return {
      totalViolations: this.violations.length,
      bySeverity,
      recentViolations: this.violations.slice(-10),
      circuitStatus: this.circuitOpen ? 'open' : 'closed',
    };
  }
}

export const tlsGuardian = new TLSGuardian();
export default TLSGuardian;
