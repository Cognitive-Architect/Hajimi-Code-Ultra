/**
 * Quintant 适配器工厂 - HAJIMI-V1.4.0-FINAL
 * 
 * 统一适配器创建入口，支持IP直连等所有策略
 * 
 * @module lib/quintant/factory
 * @version 1.4.0
 */

import { A2AAdapter, QuintantConfig } from './types';
import { MockAdapter } from './adapters/mock';
import { SecondMeAdapter } from './adapters/secondme';
import { OpenRouterAdapter } from './adapters/openrouter-real';
import { OpenRouterIPDirectAdapter } from './adapters/openrouter-ip-direct';

export type AdapterType = 
  | 'mock' 
  | 'secondme' 
  | 'openrouter' 
  | 'openrouter-real'
  | 'ip-direct'
  | 'ipdirect';

export interface FactoryConfig extends QuintantConfig {
  adapterType: AdapterType;
  // IP直连专用配置
  ipDirectConfig?: {
    primaryIP?: string;
    backupIPs?: string[];
    tlsBypass?: boolean;
  };
}

/**
 * 创建适配器实例（工厂模式）
 * 
 * 自测: FAB-001 Factory包含ip-direct case
 * 自测: FAB-002 可成功实例化
 * 自测: FAB-003 类型检查通过
 */
export function createAdapter(type: AdapterType, config: FactoryConfig): A2AAdapter {
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
    
    default:
      throw new Error(`Unknown adapter type: ${type}. Supported: mock, secondme, openrouter, ip-direct`);
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
  ];
}

/**
 * 验证适配器类型是否有效
 */
export function isValidAdapterType(type: string): type is AdapterType {
  return ['mock', 'secondme', 'openrouter', 'openrouter-real', 'ip-direct', 'ipdirect'].includes(type);
}

export default { createAdapter, getAvailableAdapters, isValidAdapterType };
