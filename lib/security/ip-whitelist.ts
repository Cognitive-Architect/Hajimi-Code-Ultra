/**
 * IP 白名单验证
 * HAJIMI-OR-IPDIRECT
 * 
 * 限制 TLS 绕过仅在受信任的 Cloudflare IP 段内使用
 * 
 * @module lib/security/ip-whitelist
 * @author 黄瓜睦 (Architect) - B-07/09
 */

// ============================================================================
// Cloudflare IP 段定义
// 来源: https://www.cloudflare.com/ips/
// 最后更新: 2026-02-17
// ============================================================================

export const CLOUDFLARE_IPV4_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  // 常用的高优先级段（OpenRouter 使用的 CF 边缘）
  '104.21.0.0/16',
  '172.67.0.0/16',
] as const;

// 更高安全级别的限制：仅允许已知的 OpenRouter 边缘节点
export const OR_STRICT_WHITELIST = [
  '104.21.63.51/32',
  '104.21.63.52/32',
  '172.67.139.30/32',
  '104.21.32.1/32',
] as const;

// ============================================================================
// IP 验证函数
// ============================================================================

/**
 * 将 IP 地址转换为整数
 */
function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    throw new SecurityError(`Invalid IP address: ${ip}`, 'INVALID_IP');
  }
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * 将 CIDR 转换为 IP 范围
 */
function cidrToRange(cidr: string): { start: number; end: number } {
  const [ip, mask] = cidr.split('/');
  if (!mask) {
    // /32 单个 IP
    const long = ipToLong(ip);
    return { start: long, end: long };
  }

  const maskBits = parseInt(mask, 10);
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
    throw new SecurityError(`Invalid CIDR mask: ${cidr}`, 'INVALID_CIDR');
  }

  const ipLong = ipToLong(ip);
  const maskLong = -1 << (32 - maskBits);
  const start = ipLong & maskLong;
  const end = start + (1 << (32 - maskBits)) - 1;

  return { start, end };
}

/**
 * 检查 IP 是否在 CIDR 范围内
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const ipLong = ipToLong(ip);
    const range = cidrToRange(cidr);
    return ipLong >= range.start && ipLong <= range.end;
  } catch {
    return false;
  }
}

/**
 * 检查 IP 是否在 Cloudflare 白名单内
 * 
 * 自测: OR-SEC-001
 */
export function isCloudflareIP(ip: string): boolean {
  return CLOUDFLARE_IPV4_RANGES.some(range => ipInCidr(ip, range));
}

/**
 * 检查 IP 是否在严格白名单内（推荐的 OpenRouter 节点）
 */
export function isStrictWhitelistedIP(ip: string): boolean {
  return OR_STRICT_WHITELIST.some(range => ipInCidr(ip, range));
}

// ============================================================================
// 安全策略验证器
// ============================================================================

export interface SecurityPolicy {
  mode: 'strict' | 'cloudflare' | 'disabled';
  enforceSNI: boolean;
  auditLog: boolean;
}

export class IPSecurityValidator {
  private policy: SecurityPolicy;
  private violationLog: Array<{ timestamp: number; ip: string; reason: string }> = [];

  constructor(policy?: Partial<SecurityPolicy>) {
    this.policy = {
      mode: 'strict',
      enforceSNI: true,
      auditLog: true,
      ...policy,
    };
  }

  /**
   * 验证 IP 是否允许 TLS 绕过
   * 
   * @param ip 要验证的 IP 地址
   * @returns 验证结果
   */
  validate(ip: string): { allowed: boolean; reason?: string } {
    if (this.policy.mode === 'disabled') {
      return { allowed: true, reason: 'Security check disabled' };
    }

    // 基本格式验证
    if (!this.isValidIPFormat(ip)) {
      const reason = `Invalid IP format: ${ip}`;
      this.logViolation(ip, reason);
      return { allowed: false, reason };
    }

    // 模式特定验证
    if (this.policy.mode === 'strict') {
      if (!isStrictWhitelistedIP(ip)) {
        const reason = `IP ${ip} not in strict whitelist`;
        this.logViolation(ip, reason);
        return { allowed: false, reason };
      }
    } else if (this.policy.mode === 'cloudflare') {
      if (!isCloudflareIP(ip)) {
        const reason = `IP ${ip} not in Cloudflare ranges`;
        this.logViolation(ip, reason);
        return { allowed: false, reason };
      }
    }

    return { allowed: true };
  }

  /**
   * 批量验证 IP 列表
   */
  validateMany(ips: string[]): { ip: string; allowed: boolean; reason?: string }[] {
    return ips.map(ip => ({ ip, ...this.validate(ip) }));
  }

  /**
   * 获取推荐的安全 IP 列表
   */
  getRecommendedIPs(): string[] {
    if (this.policy.mode === 'strict') {
      return OR_STRICT_WHITELIST.map(cidr => cidr.replace('/32', ''));
    }
    // cloudflare 模式下不提供具体推荐，因为范围太大
    return [];
  }

  /**
   * 获取违规日志
   */
  getViolations(): Array<{ timestamp: number; ip: string; reason: string }> {
    return [...this.violationLog];
  }

  private isValidIPFormat(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
      const num = parseInt(p, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  private logViolation(ip: string, reason: string): void {
    const entry = { timestamp: Date.now(), ip, reason };
    this.violationLog.push(entry);

    // 限制日志大小
    if (this.violationLog.length > 1000) {
      this.violationLog.shift();
    }

    if (this.policy.auditLog) {
      console.error(`[OR-SECURITY] VIOLATION: ${reason}`);
    }

    // 发出事件
    this.onViolation?.(entry);
  }

  onViolation?: (entry: { timestamp: number; ip: string; reason: string }) => void;
}

// ============================================================================
// 错误类型
// ============================================================================

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

export const defaultValidator = new IPSecurityValidator();

export default {
  isCloudflareIP,
  isStrictWhitelistedIP,
  ipInCidr,
  IPSecurityValidator,
  CLOUDFLARE_IPV4_RANGES,
  OR_STRICT_WHITELIST,
};
