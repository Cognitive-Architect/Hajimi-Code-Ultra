/**
 * 七权分级权限模型（R0-R6）
 * 
 * 权限级别：
 * - R0: 系统级（System）- 完全控制
 * - R1: 管理员级（Admin）- 系统配置、用户管理
 * - R2: 高级用户级（Power User）- 敏感数据访问、批量操作
 * - R3: 标准用户级（Standard）- 日常操作
 * - R4: 受限用户级（Limited）- 只读、受限写入
 * - R5: 访客级（Guest）- 仅浏览
 * - R6: 沙箱级（Sandbox）- 完全隔离
 * 
 * 特性：
 * - 能力令牌（Capability Token）
 * - 权限提升审计
 * - 时间限制令牌
 */

import { EventEmitter } from 'events';
import { randomBytes, createHash } from 'crypto';

// 权限级别枚举
export enum RightsLevel {
  R0_SYSTEM = 0,      // 系统级 - 完全控制
  R1_ADMIN = 1,       // 管理员级 - 系统配置
  R2_POWER_USER = 2,  // 高级用户级 - 敏感数据
  R3_STANDARD = 3,    // 标准用户级 - 日常操作
  R4_LIMITED = 4,     // 受限用户级 - 只读
  R5_GUEST = 5,       // 访客级 - 仅浏览
  R6_SANDBOX = 6      // 沙箱级 - 完全隔离
}

// 权限级别信息
interface RightsLevelInfo {
  level: RightsLevel;
  name: string;
  description: string;
  maxResourceUsage: number;  // 最大资源使用量百分比
  sessionTimeoutMinutes: number;
  requires2FA: boolean;
  auditLevel: 'none' | 'basic' | 'full';
}

// 权限级别定义
export const RIGHTS_LEVELS: Record<RightsLevel, RightsLevelInfo> = {
  [RightsLevel.R0_SYSTEM]: {
    level: RightsLevel.R0_SYSTEM,
    name: 'System',
    description: 'Complete system control with no restrictions',
    maxResourceUsage: 100,
    sessionTimeoutMinutes: 30,
    requires2FA: true,
    auditLevel: 'full'
  },
  [RightsLevel.R1_ADMIN]: {
    level: RightsLevel.R1_ADMIN,
    name: 'Admin',
    description: 'System configuration and user management',
    maxResourceUsage: 90,
    sessionTimeoutMinutes: 60,
    requires2FA: true,
    auditLevel: 'full'
  },
  [RightsLevel.R2_POWER_USER]: {
    level: RightsLevel.R2_POWER_USER,
    name: 'Power User',
    description: 'Access to sensitive data and batch operations',
    maxResourceUsage: 75,
    sessionTimeoutMinutes: 120,
    requires2FA: true,
    auditLevel: 'full'
  },
  [RightsLevel.R3_STANDARD]: {
    level: RightsLevel.R3_STANDARD,
    name: 'Standard',
    description: 'Standard daily operations',
    maxResourceUsage: 50,
    sessionTimeoutMinutes: 240,
    requires2FA: false,
    auditLevel: 'basic'
  },
  [RightsLevel.R4_LIMITED]: {
    level: RightsLevel.R4_LIMITED,
    name: 'Limited',
    description: 'Read-only and limited write access',
    maxResourceUsage: 25,
    sessionTimeoutMinutes: 480,
    requires2FA: false,
    auditLevel: 'basic'
  },
  [RightsLevel.R5_GUEST]: {
    level: RightsLevel.R5_GUEST,
    name: 'Guest',
    description: 'View-only access',
    maxResourceUsage: 10,
    sessionTimeoutMinutes: 60,
    requires2FA: false,
    auditLevel: 'none'
  },
  [RightsLevel.R6_SANDBOX]: {
    level: RightsLevel.R6_SANDBOX,
    name: 'Sandbox',
    description: 'Fully isolated environment',
    maxResourceUsage: 5,
    sessionTimeoutMinutes: 30,
    requires2FA: false,
    auditLevel: 'full'
  }
};

// 能力令牌
interface CapabilityToken {
  tokenId: string;
  userId: string;
  level: RightsLevel;
  grantedAt: Date;
  expiresAt: Date;
  capabilities: string[];
  constraints: {
    maxCalls?: number;
    allowedResources?: string[];
    allowedOperations?: string[];
  };
  signature: string;
}

// 权限提升请求
interface EscalationRequest {
  requestId: string;
  userId: string;
  currentLevel: RightsLevel;
  requestedLevel: RightsLevel;
  reason: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

// 审计日志条目
interface AuditLogEntry {
  timestamp: Date;
  userId: string;
  action: string;
  level: RightsLevel;
  resource: string;
  result: 'success' | 'failure' | 'blocked';
  details?: Record<string, unknown>;
}

// 七权权限管理器配置
interface SevenRightsConfig {
  // 是否启用权限提升确认
  requireEscalationConfirmation: boolean;
  // 权限提升超时（分钟）
  escalationTimeoutMinutes: number;
  // 最大令牌有效期（分钟）
  maxTokenLifetimeMinutes: number;
  // 是否启用审计日志
  enableAuditLog: boolean;
}

// 默认配置
const DEFAULT_CONFIG: SevenRightsConfig = {
  requireEscalationConfirmation: true,
  escalationTimeoutMinutes: 10,
  maxTokenLifetimeMinutes: 480,
  enableAuditLog: true
};

/**
 * 权限验证错误
 */
export class RightsViolationError extends Error {
  constructor(
    message: string,
    public code: string,
    public requiredLevel: RightsLevel,
    public currentLevel: RightsLevel
  ) {
    super(message);
    this.name = 'RightsViolationError';
  }
}

/**
 * 七权分级权限管理器
 */
export class SevenRightsManager extends EventEmitter {
  private config: SevenRightsConfig;
  private activeTokens: Map<string, CapabilityToken> = new Map();
  private escalationRequests: Map<string, EscalationRequest> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private userRights: Map<string, RightsLevel> = new Map();

  constructor(config: Partial<SevenRightsConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 启动令牌清理定时器
    this.startTokenCleanup();
  }

  /**
   * 启动令牌清理定时器
   */
  private startTokenCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 清理过期令牌
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    const expiredTokens: string[] = [];
    this.activeTokens.forEach((token, tokenId) => {
      if (token.expiresAt < now) {
        expiredTokens.push(tokenId);
      }
    });
    for (const tokenId of expiredTokens) {
      const token = this.activeTokens.get(tokenId);
      this.activeTokens.delete(tokenId);
      if (token) {
        this.emit('token:expired', { tokenId, userId: token.userId });
      }
    }
  }

  /**
   * 生成签名
   */
  private generateSignature(data: string): string {
    return createHash('sha256').update(data + process.env.RIGHTS_SECRET || 'default-secret').digest('hex');
  }

  /**
   * 验证令牌签名
   */
  private verifyTokenSignature(token: CapabilityToken): boolean {
    const data = `${token.tokenId}:${token.userId}:${token.level}:${token.grantedAt.toISOString()}`;
    return token.signature === this.generateSignature(data);
  }

  /**
   * 设置用户权限级别
   */
  setUserRights(userId: string, level: RightsLevel): void {
    this.userRights.set(userId, level);
    this.emit('rights:set', { userId, level });
  }

  /**
   * 获取用户权限级别
   */
  getUserRights(userId: string): RightsLevel {
    return this.userRights.get(userId) ?? RightsLevel.R6_SANDBOX;
  }

  /**
   * 生成能力令牌
   */
  generateToken(
    userId: string,
    level: RightsLevel,
    capabilities: string[] = [],
    lifetimeMinutes: number = 60,
    constraints: CapabilityToken['constraints'] = {}
  ): CapabilityToken {
    const tokenId = randomBytes(16).toString('hex');
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + Math.min(lifetimeMinutes, this.config.maxTokenLifetimeMinutes) * 60000);

    // 构建令牌数据
    const data = `${tokenId}:${userId}:${level}:${grantedAt.toISOString()}`;
    const signature = this.generateSignature(data);

    const token: CapabilityToken = {
      tokenId,
      userId,
      level,
      grantedAt,
      expiresAt,
      capabilities,
      constraints,
      signature
    };

    this.activeTokens.set(tokenId, token);
    
    this.emit('token:generated', { tokenId, userId, level });
    this.audit('token_generated', userId, level, 'token', 'success', { tokenId, capabilities });

    return token;
  }

  /**
   * 验证令牌
   */
  validateToken(tokenId: string): CapabilityToken | null {
    const token = this.activeTokens.get(tokenId);
    if (!token) return null;

    // 检查过期
    if (token.expiresAt < new Date()) {
      this.activeTokens.delete(tokenId);
      this.emit('token:expired', { tokenId, userId: token.userId });
      return null;
    }

    // 验证签名
    if (!this.verifyTokenSignature(token)) {
      this.emit('token:invalid', { tokenId, userId: token.userId });
      return null;
    }

    return token;
  }

  /**
   * 撤销令牌
   */
  revokeToken(tokenId: string): boolean {
    const token = this.activeTokens.get(tokenId);
    if (!token) return false;

    this.activeTokens.delete(tokenId);
    this.emit('token:revoked', { tokenId, userId: token.userId });
    this.audit('token_revoked', token.userId, token.level, 'token', 'success', { tokenId });

    return true;
  }

  /**
   * 检查权限
   */
  checkPermission(
    userId: string,
    requiredLevel: RightsLevel,
    operation: string,
    resource: string
  ): { allowed: boolean; token?: CapabilityToken } {
    const userLevel = this.getUserRights(userId);

    // 查找有效令牌
    let token: CapabilityToken | undefined;
    Array.from(this.activeTokens.values()).forEach(t => {
      if (!token && t.userId === userId && t.level <= requiredLevel) {
        if (this.validateToken(t.tokenId)) {
          token = t;
        }
      }
    });

    // 检查权限级别
    if (userLevel > requiredLevel && !token) {
      this.audit('permission_denied', userId, userLevel, resource, 'blocked', { 
        requiredLevel, 
        operation,
        reason: 'insufficient_rights'
      });
      
      throw new RightsViolationError(
        `Permission denied: ${operation} requires ${RIGHTS_LEVELS[requiredLevel].name} level`,
        'INSUFFICIENT_RIGHTS',
        requiredLevel,
        userLevel
      );
    }

    // 检查令牌能力约束
    if (token) {
      if (token.constraints.allowedOperations && 
          !token.constraints.allowedOperations.includes(operation)) {
        this.audit('permission_denied', userId, token.level, resource, 'blocked', {
          operation,
          reason: 'operation_not_in_token'
        });
        return { allowed: false };
      }

      if (token.constraints.allowedResources && 
          !token.constraints.allowedResources.includes(resource)) {
        this.audit('permission_denied', userId, token.level, resource, 'blocked', {
          resource,
          reason: 'resource_not_in_token'
        });
        return { allowed: false };
      }
    }

    this.audit('permission_granted', userId, token?.level ?? userLevel, resource, 'success', {
      operation,
      usedToken: !!token
    });

    return { allowed: true, token };
  }

  /**
   * 请求权限提升
   */
  requestEscalation(
    userId: string,
    requestedLevel: RightsLevel,
    reason: string
  ): EscalationRequest {
    const currentLevel = this.getUserRights(userId);

    // 不能提升到比自己当前级别更低的级别
    if (requestedLevel >= currentLevel) {
      throw new RightsViolationError(
        'Cannot escalate to same or lower level',
        'INVALID_ESCALATION',
        requestedLevel,
        currentLevel
      );
    }

    // 检查是否有待处理的请求
    for (const request of this.escalationRequests.values()) {
      if (request.userId === userId && request.status === 'pending') {
        throw new Error('Pending escalation request already exists');
      }
    }

    const requestId = randomBytes(8).toString('hex');
    const request: EscalationRequest = {
      requestId,
      userId,
      currentLevel,
      requestedLevel,
      reason,
      requestedAt: new Date(),
      status: 'pending'
    };

    this.escalationRequests.set(requestId, request);

    this.emit('escalation:requested', request);
    this.audit('escalation_requested', userId, currentLevel, 'escalation', 'success', {
      requestId,
      requestedLevel,
      reason
    });

    // 设置超时
    setTimeout(() => {
      const req = this.escalationRequests.get(requestId);
      if (req && req.status === 'pending') {
        req.status = 'expired';
        this.emit('escalation:expired', { requestId });
      }
    }, this.config.escalationTimeoutMinutes * 60000);

    return request;
  }

  /**
   * 批准权限提升
   */
  approveEscalation(requestId: string, approvedBy: string): EscalationRequest | null {
    const request = this.escalationRequests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    // 检查批准者权限
    const approverLevel = this.getUserRights(approvedBy);
    if (approverLevel > 1) { // RightsLevel.R1_ADMIN = 1
      throw new RightsViolationError(
        'Only Admin or higher can approve escalations',
        'UNAUTHORIZED_APPROVAL',
        1,
        approverLevel
      );
    }

    request.approvedBy = approvedBy;
    request.approvedAt = new Date();
    request.status = 'approved';

    // 临时提升用户权限
    this.setUserRights(request.userId, request.requestedLevel);

    this.emit('escalation:approved', request);
    this.audit('escalation_approved', request.userId, request.requestedLevel, 'escalation', 'success', {
      requestId,
      approvedBy
    });

    return request;
  }

  /**
   * 拒绝权限提升
   */
  denyEscalation(requestId: string, deniedBy: string): EscalationRequest | null {
    const request = this.escalationRequests.get(requestId);
    if (!request || request.status !== 'pending') return null;

    request.status = 'denied';

    this.emit('escalation:denied', { requestId, deniedBy });
    this.audit('escalation_denied', request.userId, request.currentLevel, 'escalation', 'failure', {
      requestId,
      deniedBy
    });

    return request;
  }

  /**
   * 审计日志
   */
  private audit(
    action: string,
    userId: string,
    level: RightsLevel,
    resource: string,
    result: 'success' | 'failure' | 'blocked',
    details?: Record<string, unknown>
  ): void {
    if (!this.config.enableAuditLog) return;

    const entry: AuditLogEntry = {
      timestamp: new Date(),
      userId,
      action,
      level,
      resource,
      result,
      details
    };

    this.auditLog.push(entry);
    
    // 保留最近10000条记录
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    this.emit('audit', entry);
  }

  /**
   * 获取审计日志
   */
  getAuditLog(
    options: {
      userId?: string;
      level?: RightsLevel;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    } = {}
  ): AuditLogEntry[] {
    let logs = [...this.auditLog];

    if (options.userId) {
      logs = logs.filter(l => l.userId === options.userId);
    }

    if (options.level !== undefined) {
      logs = logs.filter(l => l.level === options.level);
    }

    if (options.startTime) {
      logs = logs.filter(l => l.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      logs = logs.filter(l => l.timestamp <= options.endTime!);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * 获取用户统计
   */
  getUserStats(userId: string): {
    currentLevel: RightsLevel;
    activeTokens: number;
    totalRequests: number;
    blockedRequests: number;
  } {
    const userLogs = this.auditLog.filter(l => l.userId === userId);
    const blockedRequests = userLogs.filter(l => l.result === 'blocked').length;
    const activeTokens = Array.from(this.activeTokens.values()).filter(t => t.userId === userId).length;

    return {
      currentLevel: this.getUserRights(userId),
      activeTokens,
      totalRequests: userLogs.length,
      blockedRequests
    };
  }

  /**
   * 获取权限级别信息
   */
  getRightsLevelInfo(level: RightsLevel): RightsLevelInfo {
    return RIGHTS_LEVELS[level];
  }

  /**
   * 列出所有权限级别
   */
  listRightsLevels(): RightsLevelInfo[] {
    return Object.values(RIGHTS_LEVELS);
  }
}

// 导出单例
export const sevenRightsManager = new SevenRightsManager();

// 导出类型
export type {
  RightsLevelInfo,
  CapabilityToken,
  EscalationRequest,
  AuditLogEntry,
  SevenRightsConfig
};
