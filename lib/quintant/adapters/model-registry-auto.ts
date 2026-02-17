/**
 * 自动模型注册表 - DEBT-OR-001 清偿
 * HAJIMI-DEBT-CLEARANCE
 * 
 * 自动同步OpenRouter模型列表，检测漂移，更新映射
 * 
 * @module lib/quintant/adapters/model-registry-auto
 * @author 压力怪 (Audit) - B-01/09
 */

import { EventEmitter } from 'events';
import type { OpenRouterIPDirectAdapter } from './openrouter-ip-direct';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  pricing: {
    prompt: number;
    completion: number;
  };
  context_length: number;
}

export interface ModelMapping {
  alias: string;
  canonicalId: string;
  confidence: number;
  lastVerified: Date;
}

export interface DriftDetectionResult {
  hasDrift: boolean;
  removedModels: string[];
  newModels: string[];
  changedPricing: Array<{ id: string; old: number; new: number }>;
}

/**
 * 自动模型注册表
 */
export class AutoModelRegistry extends EventEmitter {
  private mappings: Map<string, ModelMapping> = new Map();
  private knownModels: Map<string, ModelInfo> = new Map();
  private adapter: OpenRouterIPDirectAdapter;
  private syncIntervalMs: number;
  private syncTimer?: NodeJS.Timeout;

  constructor(
    adapter: OpenRouterIPDirectAdapter,
    options: { syncIntervalMs?: number } = {}
  ) {
    super();
    this.adapter = adapter;
    this.syncIntervalMs = options.syncIntervalMs || 24 * 60 * 60 * 1000; // 24小时
    this.loadDefaultMappings();
  }

  /**
   * 加载默认映射表
   */
  private loadDefaultMappings(): void {
    const defaults: Record<string, string> = {
      'deepseek-v3': 'deepseek/deepseek-chat',
      'deepseek-chat': 'deepseek/deepseek-chat',
      'deepseek-coder': 'deepseek/deepseek-coder',
      'gpt-4': 'openai/gpt-4',
      'gpt-4o': 'openai/gpt-4o',
      'gpt-4o-mini': 'openai/gpt-4o-mini',
      'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
      'claude-3-opus': 'anthropic/claude-3-opus',
      'claude-3-sonnet': 'anthropic/claude-3-sonnet',
      'claude-3-haiku': 'anthropic/claude-3-haiku',
      'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
      'gemini-pro': 'google/gemini-pro',
      'gemini-flash': 'google/gemini-flash-1.5',
      'llama-3-70b': 'meta-llama/llama-3-70b-instruct',
      'llama-3-8b': 'meta-llama/llama-3-8b-instruct',
      'mistral-large': 'mistralai/mistral-large',
      'mistral-medium': 'mistralai/mistral-medium',
    };

    for (const [alias, canonical] of Object.entries(defaults)) {
      this.mappings.set(alias, {
        alias,
        canonicalId: canonical,
        confidence: 1.0,
        lastVerified: new Date(),
      });
    }
  }

  /**
   * 同步OpenRouter模型列表
   * 
   * 自测: DEBT-001-001 每日自动同步
   */
  async syncModels(): Promise<DriftDetectionResult> {
    try {
      // 通过IP直连获取模型列表
      const response = await this.fetchModelsViaIPDirect();
      const currentModels = new Map<string, ModelInfo>();

      for (const model of response.data) {
        currentModels.set(model.id, model);
      }

      // 检测漂移
      const drift = this.detectDrift(this.knownModels, currentModels);
      
      // 更新已知模型
      this.knownModels = currentModels;

      // 自动更新映射表
      if (drift.newModels.length > 0) {
        this.autoGenerateMappings(drift.newModels, currentModels);
      }

      // 验证现有映射
      this.verifyExistingMappings();

      this.emit('sync:complete', { 
        timestamp: new Date(),
        modelCount: currentModels.size,
        drift 
      });

      return drift;
    } catch (error) {
      this.emit('sync:error', error);
      return { hasDrift: false, removedModels: [], newModels: [], changedPricing: [] };
    }
  }

  /**
   * 通过IP直连获取模型列表
   */
  private async fetchModelsViaIPDirect(): Promise<{ data: ModelInfo[] }> {
    // 使用Node.js https直接请求
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '104.21.63.51',
        port: 443,
        path: '/api/v1/models',
        method: 'GET',
        headers: {
          'Host': 'api.openrouter.ai',
          'HTTP-Referer': 'https://hajimi.ai',
        },
        agent: new https.Agent({
          rejectUnauthorized: false,
          servername: 'api.openrouter.ai',
        }),
        timeout: 10000,
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse models response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  /**
   * 检测模型漂移
   * 
   * 自测: DEBT-001-002 漂移检测报警
   */
  private detectDrift(
    oldModels: Map<string, ModelInfo>,
    newModels: Map<string, ModelInfo>
  ): DriftDetectionResult {
    const removedModels: string[] = [];
    const newModelsList: string[] = [];
    const changedPricing: Array<{ id: string; old: number; new: number }> = [];

    // 检测移除的模型
    for (const id of oldModels.keys()) {
      if (!newModels.has(id)) {
        removedModels.push(id);
      }
    }

    // 检测新模型
    for (const [id, info] of newModels) {
      if (!oldModels.has(id)) {
        newModelsList.push(id);
      } else {
        // 检测价格变化
        const oldInfo = oldModels.get(id)!;
        if (Math.abs(oldInfo.pricing.prompt - info.pricing.prompt) > 0.000001) {
          changedPricing.push({
            id,
            old: oldInfo.pricing.prompt,
            new: info.pricing.prompt,
          });
        }
      }
    }

    const hasDrift = removedModels.length > 0 || 
                     newModelsList.length > 0 || 
                     changedPricing.length > 0;

    if (hasDrift) {
      this.emit('drift:detected', {
        removedModels,
        newModels: newModelsList,
        changedPricing,
        timestamp: new Date(),
      });
    }

    return { hasDrift, removedModels, newModels: newModelsList, changedPricing };
  }

  /**
   * 自动生成新模型映射
   */
  private autoGenerateMappings(
    newModelIds: string[],
    models: Map<string, ModelInfo>
  ): void {
    for (const id of newModelIds) {
      const model = models.get(id);
      if (!model) continue;

      // 生成别名 (简化版本)
      const alias = this.generateAlias(id, model.name);
      
      this.mappings.set(alias, {
        alias,
        canonicalId: id,
        confidence: 0.8, // 自动生成的映射置信度较低
        lastVerified: new Date(),
      });

      this.emit('mapping:auto-generated', { alias, canonicalId: id });
    }
  }

  /**
   * 生成别名
   */
  private generateAlias(id: string, name: string): string {
    // 移除provider前缀
    const shortId = id.split('/').pop() || id;
    
    // 常见别名规则
    const rules: Array<[RegExp, string]> = [
      [/claude-3-5-sonnet/, 'claude-sonnet-3.5'],
      [/claude-3-opus/, 'claude-opus'],
      [/gpt-4o-mini/, 'gpt-4o-mini'],
      [/gpt-4o/, 'gpt-4o'],
      [/deepseek-chat/, 'deepseek-v3'],
    ];

    for (const [pattern, alias] of rules) {
      if (pattern.test(id)) return alias;
    }

    return shortId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /**
   * 验证现有映射
   */
  private verifyExistingMappings(): void {
    for (const mapping of this.mappings.values()) {
      if (this.knownModels.has(mapping.canonicalId)) {
        mapping.confidence = 1.0;
        mapping.lastVerified = new Date();
      } else {
        // 模型不存在，降低置信度
        mapping.confidence *= 0.9;
        this.emit('mapping:verify-failed', mapping);
      }
    }
  }

  /**
   * 解析模型别名
   * 
   * 自测: DEBT-001-003 Fallback映射准确率>95%
   */
  resolveModel(aliasOrId: string): { id: string; confidence: number } {
    // 直接匹配
    if (this.knownModels.has(aliasOrId)) {
      return { id: aliasOrId, confidence: 1.0 };
    }

    // 映射表匹配
    const mapping = this.mappings.get(aliasOrId);
    if (mapping && mapping.confidence > 0.5) {
      return { id: mapping.canonicalId, confidence: mapping.confidence };
    }

    // 启发式推断 (Fallback)
    const inferred = this.inferModelId(aliasOrId);
    if (inferred) {
      return { id: inferred, confidence: 0.6 };
    }

    // 原样返回
    return { id: aliasOrId, confidence: 0.3 };
  }

  /**
   * 启发式推断模型ID
   */
  private inferModelId(alias: string): string | null {
    const lower = alias.toLowerCase();
    
    // 在已知模型中查找匹配
    for (const [id, info] of this.knownModels) {
      const shortId = id.split('/').pop()?.toLowerCase() || '';
      if (shortId.includes(lower) || lower.includes(shortId)) {
        return id;
      }
      if (info.name.toLowerCase().includes(lower)) {
        return id;
      }
    }

    return null;
  }

  /**
   * 启动自动同步
   */
  startAutoSync(): void {
    this.syncModels(); // 立即执行一次
    this.syncTimer = setInterval(() => {
      this.syncModels();
    }, this.syncIntervalMs);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * 导出映射表
   */
  exportMappings(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [alias, mapping] of this.mappings) {
      if (mapping.confidence > 0.7) {
        result[alias] = mapping.canonicalId;
      }
    }
    return result;
  }

  dispose(): void {
    this.stopAutoSync();
    this.removeAllListeners();
  }
}

export default AutoModelRegistry;
