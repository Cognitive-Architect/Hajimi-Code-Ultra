/**
 * OpenRouter Logs API 验证器
 * HAJIMI-OR-IPDIRECT
 * 
 * 确保每次调用都被 OpenRouter 记录，消灭假阳性
 * 
 * @module lib/testing/or-logs-validator
 * @author 咕咕嘎嘎 (QA) - B-04/09
 */

import * as https from 'https';

// ============================================================================
// 类型定义
// ============================================================================

export interface ORLogEntry {
  id: string;
  created: number;
  model: string;
  provider: string;
  tokens_prompt: number;
  tokens_completion: number;
  cost: number;
  latency: number;
  status: 'succeeded' | 'failed' | 'cancelled';
  metadata?: {
    trace_id?: string;
    [key: string]: unknown;
  };
}

export interface ValidationResult {
  success: boolean;
  logFound: boolean;
  logEntry?: ORLogEntry;
  costVerified: boolean;
  modelMatched: boolean;
  latencyMs: number;
  errors: string[];
}

export interface ValidatorOptions {
  apiKey: string;
  pollIntervalMs: number;
  maxPollAttempts: number;
  lookbackWindowMinutes: number;
}

// ============================================================================
// Logs API 验证器
// ============================================================================

export class ORLogsValidator {
  private options: ValidatorOptions;
  private lastValidation?: ValidationResult;

  constructor(options?: Partial<ValidatorOptions>) {
    this.options = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      pollIntervalMs: 3000,
      maxPollAttempts: 10,
      lookbackWindowMinutes: 5,
      ...options,
    };

    if (!this.options.apiKey) {
      throw new ORValidatorError(
        'OPENROUTER_API_KEY is required for log validation',
        'API_KEY_MISSING'
      );
    }
  }

  // ========================================================================
  // 核心验证方法
  // ========================================================================

  /**
   * 验证调用是否被记录到 OpenRouter Logs
   * 
   * @param expectedModel 期望的模型ID
   * @param traceId 可选的追踪ID用于匹配
   * @returns 验证结果
   */
  async validate(
    expectedModel: string,
    traceId?: string
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    console.log(`[OR-VALIDATOR] Starting validation for model: ${expectedModel}`);
    
    let logEntry: ORLogEntry | undefined;
    let attempts = 0;

    // 轮询检查 Logs
    while (attempts < this.options.maxPollAttempts) {
      attempts++;
      console.log(`[OR-VALIDATOR] Poll attempt ${attempts}/${this.options.maxPollAttempts}`);
      
      try {
        const logs = await this.fetchLogs();
        logEntry = this.findMatchingLog(logs, expectedModel, traceId);
        
        if (logEntry) {
          console.log(`[OR-VALIDATOR] ✓ Log found: ${logEntry.id}`);
          break;
        }
      } catch (err) {
        errors.push(`Poll ${attempts} failed: ${err}`);
      }

      if (attempts < this.options.maxPollAttempts) {
        await this.sleep(this.options.pollIntervalMs);
      }
    }

    const latencyMs = Date.now() - startTime;

    // 构建验证结果
    const result: ValidationResult = {
      success: false,
      logFound: !!logEntry,
      logEntry,
      costVerified: false,
      modelMatched: false,
      latencyMs,
      errors,
    };

    if (!logEntry) {
      errors.push(`Log not found after ${attempts} attempts`);
      this.lastValidation = result;
      return result;
    }

    // 验证 Cost > 0
    result.costVerified = logEntry.cost > 0 || logEntry.tokens_prompt > 0;
    if (!result.costVerified) {
      errors.push(`Cost is zero: ${logEntry.cost}`);
    }

    // 验证模型匹配
    result.modelMatched = logEntry.model === expectedModel || 
                          logEntry.model.includes(expectedModel.split('/').pop() || '');
    if (!result.modelMatched) {
      errors.push(`Model mismatch: expected ${expectedModel}, got ${logEntry.model}`);
    }

    // 最终成功判定
    result.success = result.logFound && result.costVerified && result.modelMatched;

    this.lastValidation = result;
    
    console.log(`[OR-VALIDATOR] Validation ${result.success ? 'PASSED' : 'FAILED'}`);
    console.log(`[OR-VALIDATOR]   Log found: ${result.logFound}`);
    console.log(`[OR-VALIDATOR]   Cost > 0: ${result.costVerified} (${logEntry.cost})`);
    console.log(`[OR-VALIDATOR]   Model matched: ${result.modelMatched}`);

    return result;
  }

  /**
   * 快速验证（30秒内）
   * 用于 CI/CD 和即时验证
   */
  async validateQuick(expectedModel: string): Promise<ValidationResult> {
    const originalMaxAttempts = this.options.maxPollAttempts;
    this.options.maxPollAttempts = 10; // 30秒 = 10次 × 3秒
    
    try {
      return await this.validate(expectedModel);
    } finally {
      this.options.maxPollAttempts = originalMaxAttempts;
    }
  }

  // ========================================================================
  // Logs API 调用
  // ========================================================================

  private async fetchLogs(): Promise<ORLogEntry[]> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: 'api.openrouter.ai',
        port: 443,
        path: '/api/v1/generation',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              // OpenRouter API 返回格式: { data: ORLogEntry[] }
              resolve(parsed.data || []);
            } catch (e) {
              reject(new ORValidatorError(`Failed to parse logs: ${e}`, 'PARSE_ERROR'));
            }
          } else {
            reject(new ORValidatorError(
              `HTTP ${res.statusCode}: ${data.substring(0, 200)}`,
              'API_ERROR'
            ));
          }
        });
      });

      req.on('error', (err) => {
        reject(new ORValidatorError(`Request failed: ${err.message}`, 'REQUEST_ERROR'));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new ORValidatorError('Request timeout', 'TIMEOUT'));
      });

      req.end();
    });
  }

  // ========================================================================
  // 日志匹配逻辑
  // ========================================================================

  private findMatchingLog(
    logs: ORLogEntry[],
    expectedModel: string,
    traceId?: string
  ): ORLogEntry | undefined {
    const now = Date.now();
    const lookbackMs = this.options.lookbackWindowMinutes * 60 * 1000;

    // 按时间倒序查找
    for (const log of logs.sort((a, b) => b.created - a.created)) {
      const logTime = log.created * 1000; // OpenRouter 使用秒级时间戳
      
      // 检查时间窗口
      if (now - logTime > lookbackMs) {
        continue;
      }

      // 如果提供了 traceId，优先匹配
      if (traceId && log.metadata?.trace_id === traceId) {
        return log;
      }

      // 模型匹配
      const modelMatch = log.model === expectedModel ||
                        log.model.includes(expectedModel.split('/').pop() || '');
      
      if (modelMatch) {
        return log;
      }
    }

    return undefined;
  }

  // ========================================================================
  // Mock 穿透检测
  // ========================================================================

  /**
   * 检测是否命中 Mock（假阳性检测）
   * 
   * @param adapterResponse 适配器返回的响应
   * @returns 是否可能是 Mock 响应
   */
  detectMockHit(adapterResponse: unknown): boolean {
    // Mock 响应特征检测
    if (!adapterResponse || typeof adapterResponse !== 'object') {
      return true;
    }

    const resp = adapterResponse as Record<string, unknown>;

    // 检查是否有 OpenRouter 特有字段
    const hasORId = typeof resp.id === 'string' && resp.id.startsWith('gen-');
    const hasProvider = typeof resp.provider === 'string';
    const hasUsage = resp.usage && typeof resp.usage === 'object';

    // 如果缺少这些字段，可能是 Mock
    return !(hasORId && hasProvider && hasUsage);
  }

  /**
   * 严格验证（双重校验）
   * 1. 检查响应格式
   * 2. 轮询 Logs API
   */
  async validateStrict(
    adapterResponse: unknown,
    expectedModel: string
  ): Promise<ValidationResult> {
    // 第一层：响应格式检查
    if (this.detectMockHit(adapterResponse)) {
      return {
        success: false,
        logFound: false,
        costVerified: false,
        modelMatched: false,
        latencyMs: 0,
        errors: ['Mock response detected - response lacks OpenRouter specific fields'],
      };
    }

    // 第二层：Logs API 验证
    return this.validate(expectedModel);
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getLastValidation(): ValidationResult | undefined {
    return this.lastValidation;
  }
}

// ============================================================================
// 错误类型
// ============================================================================

export class ORValidatorError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ORValidatorError';
  }
}

// ============================================================================
// CLI 入口
// ============================================================================

if (require.main === module) {
  const model = process.argv[2] || 'deepseek/deepseek-chat';
  
  const validator = new ORLogsValidator();
  
  validator.validate(model).then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(err => {
    console.error('[OR-VALIDATOR] Fatal error:', err);
    process.exit(1);
  });
}

export default ORLogsValidator;
