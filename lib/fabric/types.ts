/**
 * Fabric装备库类型定义
 * 
 * @module lib/fabric/types
 * @version 1.3.0
 */

import { z } from 'zod';

// ========== Pattern Schema ==========

export const PatternSchema = z.object({
  name: z.string().min(1).max(64),
  version: z.string().default('1.0.0'),
  trigger: z.enum([
    'code_review',
    'security_audit',
    'performance_check',
    'doc_generation',
    'debt_collection',
  ]),
  action: z.function().returns(z.promise(z.unknown())),
  description: z.string().min(1).max(500),
  role: z.enum(['PM', 'ARCHITECT', 'QA', 'ENGINEER', 'AUDIT', 'ORCHESTRATOR', 'DOCTOR']),
  debts: z.array(z.object({
    id: z.string(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']),
    description: z.string(),
  })).default([]),
  config: z.record(z.unknown()).default({}),
  mutex: z.array(z.string()).default([]), // 互斥Pattern
});

export type Pattern = z.infer<typeof PatternSchema>;

// ========== 装备状态 ==========

export interface FabricEquipment {
  pattern: Pattern;
  loadedAt: number;
  status: 'active' | 'inactive' | 'error';
  lastUsed: number;
  useCount: number;
}

// ========== 加载器配置 ==========

export interface FabricLoaderConfig {
  hotReload: boolean;
  validateOnLoad: boolean;
  maxPatterns: number;
  conflictCheck: boolean;
}

// ========== 冲突检测结果 ==========

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: Array<{
    pattern1: string;
    pattern2: string;
    reason: string;
  }>;
}
