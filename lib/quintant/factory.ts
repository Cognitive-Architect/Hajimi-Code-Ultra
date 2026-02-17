/**
 * Quintant 适配器工厂 - HAJIMI-V1.4.0-FINAL
 * 
 * 统一适配器创建入口，支持IP直连等所有策略
 * 
 * @module lib/quintant/factory
 * @version 1.4.0
 */

import { QuintantAdapter } from './types';
import { MockAdapter } from './adapters/mock';
import { SecondMeAdapter } from './adapters/secondme';
import { OpenRouterAdapter } from './adapters/openrouter-real';
import { OpenRouterIPDirectAdapter } from './adapters/openrouter-ip-direct';
import { LCRLocalAdapter, LCRLocalConfig } from './adapters/lcr-local';

export type AdapterType = 
  | 'mock' 
  | 'secondme' 
  | 'openrouter' 
  | 'openrouter-real'
  | 'ip-direct'
  | 'ipdirect'
  | 'lcr-local'
  | 'lcrlocal';

export interface FactoryConfig {
  apiKey?: string;
  baseUrl?: string;
  adapterType: AdapterType;
  // IP直连专用配置
  ipDirectConfig?: {
    primaryIP?: string;
    backupIPs?: string[];
    tlsBypass?: boolean;
  };
  // LCR本地运行时专用配置
  lcrLocalConfig?: Partial<LCRLocalConfig>;
}

/**
 * 创建适配器实例（工厂模式）
 * 
 * 自测: FAB-001 Factory包含ip-direct case
 * 自测: FAB-002 可成功实例化
 * 自测: FAB-003 类型检查通过
 */
export function createAdapter(type: AdapterType, config: FactoryConfig): QuintantAdapter {
  switch (type) {
    case 'mock':
      return new MockAdapter();
    
    case 'secondme':
      return new SecondMeAdapter(config);
    
    case 'openrouter':
    case 'openrouter-real':
      return new OpenRouterAdapter(config);
    
    case 'ip-direct':
    case 'ipdirect':
      // IP直连适配器，集成TLS三层防护
      return new OpenRouterIPDirectAdapter({
        apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || '',
        ipPool: {
          primary: config.ipDirectConfig?.primaryIP || '104.21.63.51',
          backups: config.ipDirectConfig?.backupIPs || ['104.21.63.52', '172.67.139.30'],
          healthCheckInterval: 30000,
          connectTimeout: 5000,
          requestTimeout: 30000,
        },
        tls: {
          rejectUnauthorized: config.ipDirectConfig?.tlsBypass ?? false,
          servername: 'api.openrouter.ai',
          pinnedIPRanges: ['104.21.0.0/16', '172.67.0.0/16'],
        },
        modelMapping: {
          'deepseek-v3': 'deepseek/deepseek-chat',
          'gpt-4': 'openai/gpt-4',
          'gpt-4o': 'openai/gpt-4o',
          'claude-3-opus': 'anthropic/claude-3-opus',
          'claude-3-sonnet': 'anthropic/claude-3-sonnet',
        },
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 30000,
          halfOpenMaxCalls: 2,
        },
        telemetry: {
          verbose: false,
          sampleRate: 1.0,
        },
      });
    
    case 'lcr-local':
    case 'lcrlocal':
      // LCR本地运行时适配器，支持离线优先和Fallback策略
      return new LCRLocalAdapter(config.lcrLocalConfig || {
        endpoint: process.env.LCR_LOCAL_ENDPOINT || 'http://localhost:11434',
        defaultModel: 'llama3',
        availableModels: ['llama3', 'llama2', 'mistral', 'codellama'],
        maxContextLength: 8192,
        timeout: 30000,
        healthCheckInterval: 30000,
        offlineMode: false,
        fallback: {
          enabled: true,
          cloudAdapter: 'ip-direct',
          fallbackThreshold: 3,
        },
      });
    
    default:
      throw new Error(`Unknown adapter type: ${type}. Supported: mock, secondme, openrouter, ip-direct, lcr-local`);
  }
}

/**
 * 获取所有可用适配器类型
 */
export function getAvailableAdapters(): Array<{ type: AdapterType; name: string; description: string }> {
  return [
    { type: 'mock', name: 'Mock', description: '本地模拟适配器，用于测试' },
    { type: 'secondme', name: 'SecondMe', description: 'SecondMe A2A协议适配器' },
    { type: 'openrouter', name: 'OpenRouter', description: 'OpenRouter标准API适配器' },
    { type: 'ip-direct', name: 'IP Direct', description: 'OpenRouter IP直连适配器（TLS三层防护）' },
    { type: 'lcr-local', name: 'LCR Local', description: 'LCR本地运行时适配器（离线优先+Fallback）' },
  ];
}

/**
 * 验证适配器类型是否有效
 */
export function isValidAdapterType(type: string): type is AdapterType {
  return ['mock', 'secondme', 'openrouter', 'openrouter-real', 'ip-direct', 'ipdirect', 'lcr-local', 'lcrlocal'].includes(type);
}

export default { createAdapter, getAvailableAdapters, isValidAdapterType };
