/**
 * B-07 Fabric 装备模块 - 核心类型定义
 * 
 * @version 1.0.0
 * @module patterns/types
 */

/**
 * Pattern类型枚举
 */
export enum PatternType {
  SYSTEM = 'system',
  CONTEXT = 'context',
  ACTION = 'action',
}

/**
 * 变量定义
 */
export interface VariableDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: unknown;
  description?: string;
}

/**
 * Pattern配置
 */
export interface PatternConfig {
  tokenLimit: number;
  compressionRatio: number;
  cacheEnabled: boolean;
  ttl: number;
}

/**
 * Pattern接口 - 所有装备的基础接口
 */
export interface Pattern {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  version: string;
  template: string;
  variables: VariableDef[];
  dependencies: string[];
  config: PatternConfig;
}
