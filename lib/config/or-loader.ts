/**
 * OpenRouter 配置加载器
 * HAJIMI-OR-IPDIRECT
 * 
 * 支持环境变量注入、运行时切换、敏感配置保护
 * 
 * @module lib/config/or-loader
 * @author Soyorin (PM) - B-03/09
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ORIPDirectConfig } from '../quintant/types';

// ============================================================================
// 配置类型定义
// ============================================================================

export interface ORBypassConfig {
  version: string;
  environment: 'mock' | 'production' | 'ipdirect' | string;
  connection: {
    strategy: 'standard' | 'ipdirect' | 'mock';
    ipdirect: {
      enabled: boolean;
      primaryIP: string;
      backupIPs: string[];
      healthCheck: {
        intervalMs: number;
        tcpTimeoutMs: number;
        httpTimeoutMs: number;
        failureThreshold: number;
      };
    };
    standard: {
      enabled: boolean;
      endpoint: string;
      timeoutMs: number;
    };
    mock: {
      enabled: boolean;
      latencyMs: number;
      errorRate: number;
    };
  };
  tls: {
    rejectUnauthorized: boolean;
    servername: string;
    pinnedIPRanges: string[];
  };
  models: {
    mapping: Record<string, string>;
    default: string;
    maxTokens: number;
  };
  resilience: {
    circuitBreaker: {
      enabled: boolean;
      failureThreshold: number;
      resetTimeoutMs: number;
      halfOpenMaxCalls: number;
    };
    retry: {
      enabled: boolean;
      maxRetries: number;
      backoffMs: number;
    };
    fallback: {
      enabled: boolean;
      toMock: boolean;
      maxFallbackDurationMs: number;
    };
  };
  telemetry: {
    enabled: boolean;
    verbose: boolean;
    sampleRate: number;
    logPrefix: string;
    emitMetrics: boolean;
  };
  security: {
    apiKeySource: 'env' | 'vault';
    apiKeyEnvVar: string;
    ipWhitelistEnforced: boolean;
    auditLogEnabled: boolean;
  };
  emergency: {
    killSwitch: {
      enabled: boolean;
      filePath: string;
      checkIntervalMs: number;
    };
    autoRollback: {
      enabled: boolean;
      consecutiveFailures: number;
      toStrategy: 'mock' | 'standard';
    };
  };
}

// ============================================================================
// 配置加载器类
// ============================================================================

export class ORConfigLoader {
  private static instance: ORConfigLoader;
  private config: ORBypassConfig | null = null;
  private configPath: string;
  private watchers: Set<(config: ORBypassConfig) => void> = new Set();
  private fileWatcher?: fs.FSWatcher;

  private constructor(configPath?: string) {
    this.configPath = configPath || this.resolveConfigPath();
  }

  static getInstance(configPath?: string): ORConfigLoader {
    if (!ORConfigLoader.instance) {
      ORConfigLoader.instance = new ORConfigLoader(configPath);
    }
    return ORConfigLoader.instance;
  }

  // ========================================================================
  // 配置路径解析
  // ========================================================================

  private resolveConfigPath(): string {
    // 优先级：环境变量 > 项目根目录 > 默认路径
    const envPath = process.env.OR_CONFIG_PATH;
    if (envPath) {
      return path.resolve(envPath);
    }

    // 尝试多个可能的位置
    const candidates = [
      path.join(process.cwd(), 'config', 'or-bypass.json'),
      path.join(process.cwd(), 'or-bypass.json'),
      path.join(__dirname, '..', '..', 'config', 'or-bypass.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0]; // 默认返回第一个，后续会报错
  }

  // ========================================================================
  // 配置加载
  // ========================================================================

  load(): ORBypassConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new ORConfigError(
        `Configuration file not found: ${this.configPath}`,
        'CONFIG_NOT_FOUND'
      );
    }

    const rawContent = fs.readFileSync(this.configPath, 'utf-8');
    const parsed = JSON.parse(rawContent);
    
    // 处理环境变量占位符 ${VAR:-default}
    const interpolated = this.interpolateEnvVars(parsed);
    
    // 验证配置
    this.validate(interpolated);
    
    this.config = interpolated;
    
    console.log(`[OR-CONFIG] Loaded from ${this.configPath}`);
    console.log(`[OR-CONFIG] Environment: ${this.config.environment}`);
    console.log(`[OR-CONFIG] Strategy: ${this.config.connection.strategy}`);
    
    return this.config;
  }

  /**
   * 获取当前配置（自动加载）
   */
  getConfig(): ORBypassConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  // ========================================================================
  // 环境变量插值
  // ========================================================================

  private interpolateEnvVars(obj: unknown): any {
    if (typeof obj === 'string') {
      return this.replaceEnvVars(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateEnvVars(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // 跳过注释键
        if (key.startsWith('_comment') || key.startsWith('_warning')) {
          continue;
        }
        result[key] = this.interpolateEnvVars(value);
      }
      return result;
    }
    
    return obj;
  }

  private replaceEnvVars(str: string): string {
    // 支持 ${VAR} 和 ${VAR:-default} 语法
    const pattern = /\$\{([^}]+)\}/g;
    
    return str.replace(pattern, (match, content) => {
      const [varName, defaultValue] = content.split(':-');
      const envValue = process.env[varName];
      
      if (envValue !== undefined) {
        return envValue;
      }
      
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      
      console.warn(`[OR-CONFIG] Environment variable ${varName} not found, keeping placeholder`);
      return match;
    });
  }

  // ========================================================================
  // 配置验证
  // ========================================================================

  private validate(config: unknown): asserts config is ORBypassConfig {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      throw new ORConfigError('Configuration must be an object', 'INVALID_CONFIG');
    }

    const cfg = config as Record<string, unknown>;

    // 验证必需字段
    if (!cfg.connection) {
      errors.push('Missing required field: connection');
    } else {
      const conn = cfg.connection as Record<string, unknown>;
      if (!conn.strategy) {
        errors.push('Missing required field: connection.strategy');
      }
    }

    if (!cfg.tls) {
      errors.push('Missing required field: tls');
    }

    // 验证IP直连配置
    if (cfg.connection?.strategy === 'ipdirect') {
      const ipdirect = (cfg.connection as Record<string, unknown>).ipdirect as Record<string, unknown>;
      if (!ipdirect?.primaryIP) {
        errors.push('IPDirect strategy requires connection.ipdirect.primaryIP');
      }
    }

    // 安全警告
    const tls = cfg.tls as Record<string, unknown> | undefined;
    if (tls?.rejectUnauthorized === false) {
      console.warn('[OR-CONFIG] ⚠️  WARNING: rejectUnauthorized is false. Ensure IP whitelist is enforced!');
    }

    if (errors.length > 0) {
      throw new ORConfigError(
        `Configuration validation failed:\n${errors.join('\n')}`,
        'VALIDATION_FAILED'
      );
    }
  }

  // ========================================================================
  // 运行时切换策略
  // ========================================================================

  /**
   * 运行时切换连接策略（无需重启）
   */
  switchStrategy(strategy: 'standard' | 'ipdirect' | 'mock'): void {
    if (!this.config) {
      throw new ORConfigError('Configuration not loaded', 'NOT_LOADED');
    }

    const oldStrategy = this.config.connection.strategy;
    this.config.connection.strategy = strategy;
    
    // 更新各策略启用状态
    this.config.connection.standard.enabled = (strategy === 'standard');
    this.config.connection.ipdirect.enabled = (strategy === 'ipdirect');
    this.config.connection.mock.enabled = (strategy === 'mock');

    console.log(`[OR-CONFIG] Strategy switched: ${oldStrategy} → ${strategy}`);
    
    // 通知监听器
    this.notifyWatchers();
  }

  /**
   * 获取API密钥（安全读取）
   */
  getApiKey(): string {
    const config = this.getConfig();
    
    if (config.security.apiKeySource === 'env') {
      const key = process.env[config.security.apiKeyEnvVar];
      if (!key) {
        throw new ORConfigError(
          `API key not found in environment variable: ${config.security.apiKeyEnvVar}`,
          'API_KEY_MISSING'
        );
      }
      return key;
    }
    
    // TODO: 实现 vault 支持
    throw new ORConfigError('Vault API key source not yet implemented', 'NOT_IMPLEMENTED');
  }

  /**
   * 转换为 Adapter 配置格式
   */
  toAdapterConfig(): ORIPDirectConfig {
    const cfg = this.getConfig();
    
    return {
      apiKey: this.getApiKey(),
      ipPool: {
        primary: cfg.connection.ipdirect.primaryIP,
        backups: cfg.connection.ipdirect.backupIPs,
        healthCheckInterval: cfg.connection.ipdirect.healthCheck.intervalMs,
        connectTimeout: cfg.connection.ipdirect.healthCheck.tcpTimeoutMs,
        requestTimeout: cfg.connection.ipdirect.healthCheck.httpTimeoutMs,
      },
      tls: {
        rejectUnauthorized: cfg.tls.rejectUnauthorized,
        servername: cfg.tls.servername,
        pinnedIPRanges: cfg.tls.pinnedIPRanges,
      },
      modelMapping: cfg.models.mapping,
      circuitBreaker: {
        failureThreshold: cfg.resilience.circuitBreaker.failureThreshold,
        resetTimeout: cfg.resilience.circuitBreaker.resetTimeoutMs,
        halfOpenMaxCalls: cfg.resilience.circuitBreaker.halfOpenMaxCalls,
      },
      telemetry: {
        verbose: cfg.telemetry.verbose,
        sampleRate: cfg.telemetry.sampleRate,
      },
    };
  }

  // ========================================================================
  // 配置监听
  // ========================================================================

  /**
   * 监听配置变化
   */
  onChange(callback: (config: ORBypassConfig) => void): () => void {
    this.watchers.add(callback);
    
    // 启动文件监听
    if (!this.fileWatcher && fs.existsSync(this.configPath)) {
      this.fileWatcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          console.log('[OR-CONFIG] File changed, reloading...');
          try {
            this.load();
            this.notifyWatchers();
          } catch (err) {
            console.error('[OR-CONFIG] Failed to reload config:', err);
          }
        }
      });
    }
    
    return () => {
      this.watchers.delete(callback);
    };
  }

  private notifyWatchers(): void {
    if (this.config) {
      for (const watcher of this.watchers) {
        try {
          watcher(this.config);
        } catch (err) {
          console.error('[OR-CONFIG] Watcher error:', err);
        }
      }
    }
  }

  // ========================================================================
  // 紧急开关检查
  // ========================================================================

  /**
   * 检查紧急停止开关
   */
  checkKillSwitch(): boolean {
    const config = this.getConfig();
    
    if (!config.emergency.killSwitch.enabled) {
      return false;
    }

    try {
      return fs.existsSync(config.emergency.killSwitch.filePath);
    } catch {
      return false;
    }
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
    this.watchers.clear();
    ORConfigLoader.instance = null as unknown as ORConfigLoader;
  }
}

// ============================================================================
// 错误类型
// ============================================================================

export class ORConfigError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ORConfigError';
  }
}

// ============================================================================
// 便捷导出
// ============================================================================

export const orConfig = ORConfigLoader.getInstance();
export default orConfig;
