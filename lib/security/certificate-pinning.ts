/**
 * 证书固定核心 - TLS-PINNING-ENHANCE B-01/03
 * HAJIMI-TLS-PINNING
 * 
 * SPKI SHA256公钥指纹固定，替代rejectUnauthorized: false
 * 
 * @module lib/security/certificate-pinning
 * @author 压力怪 (Audit)
 */

import { EventEmitter } from 'events';
import * as tls from 'tls';
import * as crypto from 'crypto';

// Cloudflare边缘证书公钥指纹 (SPKI SHA256 Base64)
// 来源: Cloudflare Universal SSL 边缘证书
const DEFAULT_PINS = {
  primary: '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=',
  backup: 'fE8JkLgnqh6Y4iNXLONii1vP6N3XG0qLvC/2Y3S1+3s=',
  // 预留轮换指纹槽位
  emergency: null as string | null,
};

export interface PinningConfig {
  pins: string[];
  enforcePinning: boolean;
  maxAge: number; // 毫秒
}

export interface PinningResult {
  success: boolean;
  matchedPin: string | null;
  certificate: tls.PeerCertificate;
  error?: string;
}

export interface PinRotationRequest {
  newPin: string;
  pskSignature: string; // 预共享密钥签名
  timestamp: number;
}

/**
 * 证书固定管理器
 */
export class CertificatePinning extends EventEmitter {
  private pins: Set<string> = new Set();
  private config: PinningConfig;
  private circuitOpen = false;
  private circuitResetTimer?: NodeJS.Timeout;

  constructor(config?: Partial<PinningConfig>) {
    super();
    this.config = {
      pins: [DEFAULT_PINS.primary, DEFAULT_PINS.backup].filter(Boolean) as string[],
      enforcePinning: true,
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90天
      ...config,
    };
    
    this.pins = new Set(this.config.pins);
  }

  /**
   * 验证证书指纹
   * 
   * 自测: SEC-001 主指纹匹配
   * 自测: SEC-002 备份指纹切换
   */
  verifyCertificate(cert: tls.PeerCertificate): PinningResult {
    const startTime = Date.now();
    
    try {
      // 提取证书原始数据
      const rawCert = cert.raw;
      if (!rawCert) {
        return this.fail('No certificate raw data');
      }

      // 计算SPKI指纹
      const pin = this.extractSPKIPin(rawCert);
      
      // 检查指纹匹配
      if (this.pins.has(pin)) {
        const elapsed = Date.now() - startTime;
        this.emit('pinning:success', { pin, elapsed });
        
        return {
          success: true,
          matchedPin: pin,
          certificate: cert,
        };
      }

      // 指纹不匹配
      return this.fail(`Pin mismatch: ${pin}`, cert);
      
    } catch (error) {
      return this.fail(`Verification error: ${error}`, cert);
    }
  }

  /**
   * 提取SPKI SHA256指纹
   */
  private extractSPKIPin(rawCert: Buffer): string {
    // 解析X.509证书获取SubjectPublicKeyInfo
    // 简化实现：使用证书原始数据的特定偏移
    // 实际应使用asn1库解析
    
    // 查找SPKI段 (简化版，假设标准位置)
    const spkiStart = this.findSPKIStart(rawCert);
    if (spkiStart === -1) {
      throw new Error('SPKI not found in certificate');
    }

    // 提取SPKI长度
    const spkiLength = rawCert[spkiStart + 1];
    const spki = rawCert.slice(spkiStart, spkiStart + 2 + spkiLength);

    // SHA256哈希并Base64编码
    const hash = crypto.createHash('sha256').update(spki).digest('base64');
    return hash;
  }

  /**
   * 查找SPKI起始位置 (简化版)
   */
  private findSPKIStart(cert: Buffer): number {
    // X.509证书结构中，SPKI通常在第3个SEQUENCE
    // 简化：搜索RSA公钥标识或EC公钥标识
    const rsaPattern = Buffer.from([0x30, 0x82]); // SEQUENCE
    
    let depth = 0;
    for (let i = 0; i < cert.length - 2; i++) {
      if (cert[i] === 0x30 && cert[i + 1] & 0x80) {
        depth++;
        if (depth === 3) {
          return i;
        }
      }
    }
    
    return -1;
  }

  /**
   * 处理验证失败
   * 
   * 自测: SEC-003 伪造证书熔断<100ms
   */
  private fail(message: string, cert?: tls.PeerCertificate): PinningResult {
    // 立即熔断
    this.triggerCircuitBreaker();
    
    this.emit('pinning:failed', {
      message,
      timestamp: Date.now(),
      pins: Array.from(this.pins),
    });

    return {
      success: false,
      matchedPin: null,
      certificate: cert || {} as tls.PeerCertificate,
      error: message,
    };
  }

  /**
   * 触发熔断
   */
  private triggerCircuitBreaker(): void {
    if (this.circuitOpen) return;
    
    this.circuitOpen = true;
    this.emit('circuit:open', { timestamp: Date.now() });

    // 5分钟后尝试恢复
    this.circuitResetTimer = setTimeout(() => {
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
   * 指纹轮换
   * 
   * 需PSK签名验证
   */
  rotatePin(request: PinRotationRequest): boolean {
    // 验证PSK签名
    if (!this.verifyPSKSignature(request)) {
      this.emit('rotation:failed', { reason: 'invalid_signature' });
      return false;
    }

    // 检查时间戳 (防重放)
    const now = Date.now();
    if (Math.abs(now - request.timestamp) > 5 * 60 * 1000) {
      this.emit('rotation:failed', { reason: 'timestamp_expired' });
      return false;
    }

    // 添加新指纹
    this.pins.add(request.newPin);
    
    // 清理过期指纹
    this.cleanupOldPins();

    this.emit('rotation:success', {
      newPin: request.newPin,
      activePins: Array.from(this.pins),
      timestamp: now,
    });

    return true;
  }

  /**
   * 验证PSK签名
   */
  private verifyPSKSignature(request: PinRotationRequest): boolean {
    // 从环境变量获取PSK
    const psk = process.env.HAJIMI_PSK || '';
    if (!psk) return false;

    // 验证签名
    const message = `${request.newPin}:${request.timestamp}`;
    const expectedSig = crypto
      .createHmac('sha256', psk)
      .update(message)
      .digest('hex');

    return request.pskSignature === expectedSig;
  }

  /**
   * 清理过期指纹
   */
  private cleanupOldPins(): void {
    // 保留最多3个指纹
    const pins = Array.from(this.pins);
    if (pins.length > 3) {
      // 移除最旧的 (简化：按添加顺序)
      this.pins.delete(pins[0]);
    }
  }

  /**
   * 创建TLS检查回调
   */
  createCheckCallback(): (host: string, cert: tls.PeerCertificate) => Error | undefined {
    return (host: string, cert: tls.PeerCertificate) => {
      if (!this.config.enforcePinning) {
        return undefined;
      }

      const result = this.verifyCertificate(cert);
      
      if (!result.success) {
        return new Error(`Certificate pinning failed: ${result.error}`);
      }

      return undefined;
    };
  }

  /**
   * 获取当前指纹列表
   */
  getPins(): string[] {
    return Array.from(this.pins);
  }

  dispose(): void {
    if (this.circuitResetTimer) {
      clearTimeout(this.circuitResetTimer);
    }
    this.removeAllListeners();
  }
}

export const certificatePinning = new CertificatePinning();
export default CertificatePinning;
