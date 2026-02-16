/**
 * TSA (Time-Spatial Agent) 类型定义
 * 
 * @module lib/tsa/types
 * @version 1.3.0
 */

import { z } from 'zod';

// ========== 七状态机定义 ==========

export const AgentStateSchema = z.enum([
  'IDLE',        // 空闲
  'ACTIVE',      // 活跃
  'SUSPENDED',   // 暂停
  'TERMINATED',  // 已终止
  'ERROR',       // 错误
  'RECOVERING',  // 恢复中
  'MIGRATING',   // 迁移中
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

// ========== 状态流转规则 ==========

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  trigger: string;
  guard?: (context: TransitionContext) => boolean;
  action?: (context: TransitionContext) => void;
}

export interface TransitionContext {
  agentId: string;
  fromState: AgentState;
  toState: AgentState;
  trigger: string;
  payload?: unknown;
  timestamp: number;
}

// ========== 12条标准流转规则 ==========
export const STANDARD_TRANSITIONS: StateTransition[] = [
  { from: 'IDLE', to: 'ACTIVE', trigger: 'activate' },
  { from: 'ACTIVE', to: 'SUSPENDED', trigger: 'suspend' },
  { from: 'SUSPENDED', to: 'ACTIVE', trigger: 'resume' },
  { from: 'ACTIVE', to: 'TERMINATED', trigger: 'terminate' },
  { from: 'SUSPENDED', to: 'TERMINATED', trigger: 'terminate' },
  { from: 'ACTIVE', to: 'ERROR', trigger: 'error' },
  { from: 'SUSPENDED', to: 'ERROR', trigger: 'error' },
  { from: 'ERROR', to: 'RECOVERING', trigger: 'recover' },
  { from: 'RECOVERING', to: 'ACTIVE', trigger: 'recovered' },
  { from: 'RECOVERING', to: 'ERROR', trigger: 'recover_failed' },
  { from: 'ACTIVE', to: 'MIGRATING', trigger: 'migrate' },
  { from: 'MIGRATING', to: 'ACTIVE', trigger: 'migrated' },
];

// ========== TSA配置 ==========

export const TSAConfigSchema = z.object({
  persistence: z.object({
    enabled: z.boolean().default(true),
    storage: z.enum(['localStorage', 'memory']).default('localStorage'),
    key: z.string().default('tsa-state'),
  }),
  middleware: z.object({
    logging: z.boolean().default(true),
    persistence: z.boolean().default(true),
    monitoring: z.boolean().default(true),
  }),
  isolation: z.enum(['HARD', 'SOFT']).default('SOFT'),
});

export type TSAConfig = z.infer<typeof TSAConfigSchema>;

// ========== 状态历史 ==========

export interface StateHistoryEntry {
  from: AgentState;
  to: AgentState;
  trigger: string;
  timestamp: number;
  duration: number; // 在from状态的持续时间
}

// ========== BNF协议 ==========

export type BNFCommand = 
  | '[SPAWN]'
  | '[TERMINATE]'
  | '[VACUUM]'
  | '[SUSPEND]'
  | '[RESUME]'
  | '[MIGRATE]';

export interface BNFParsedCommand {
  command: BNFCommand;
  agentId?: string;
  payload?: Record<string, unknown>;
}
