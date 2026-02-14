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
 * Action类型枚举
 */
export enum ActionType {
  ANALYZE = 'analyze',
  IMPLEMENT = 'implement',
  REVIEW = 'review',
}

/**
 * Context类型枚举
 */
export enum ContextType {
  HISTORY = 'history',
  STATE = 'state',
  TASK = 'task',
}

/**
 * 变量定义
 */
export interface VariableDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: unknown;
  defaultValue?: unknown;
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
 * Pattern版本
 */
export interface PatternVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Token优化配置
 */
export interface TokenOptimization {
  enabled: boolean;
  compressionRatio: number;
  useAbbreviations: boolean;
  stripComments: boolean;
  minifyWhitespace: boolean;
}

/**
 * Pattern元数据
 */
export interface PatternMeta {
  id: string;
  name: string;
  description: string;
  version: PatternVersion;
  author: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 步骤定义
 */
export interface Step {
  id: string;
  name: string;
  description: string;
  prompt: string;
  validation?: string;
}

/**
 * 上下文片段
 */
export interface ContextFragment {
  type: ContextType;
  content: string;
  priority: number;
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

/**
 * Action Pattern接口
 */
export interface ActionPattern {
  meta: PatternMeta;
  type: PatternType.ACTION;
  actionType: ActionType;
  content: string;
  variables: VariableDef[];
  steps: Step[];
  preconditions: string[];
  postconditions: string[];
  timeout: number;
  tokenOpt: TokenOptimization;
  dependencies: string[];
}

/**
 * Context Pattern接口
 */
export interface ContextPattern {
  meta: PatternMeta;
  type: PatternType.CONTEXT;
  contextType: ContextType;
  content: string;
  variables: VariableDef[];
  fragments: ContextFragment[];
  maxTokens: number;
  evictionPolicy: 'lru' | 'fifo' | 'priority';
  tokenOpt: TokenOptimization;
  dependencies: string[];
}
