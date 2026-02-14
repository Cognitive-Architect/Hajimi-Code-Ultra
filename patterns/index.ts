/**
 * B-07 Fabric 装备模块
 * 三层装备库：System | Context | Action
 * 
 * @version 1.0.0
 * @module patterns
 */

// ============================================================================
// 类型定义
// ============================================================================

export {
  // 枚举
  PatternType,
} from './types';

export type {
  // 接口
  Pattern,
  VariableDef,
  PatternConfig,
} from './types';

export type {
  // 类型别名
  Pattern as FabricPattern,
  VariableDef as FabricVariable,
  PatternConfig as FabricConfig,
} from './types';

// ============================================================================
// 注册中心
// ============================================================================

export {
  // 注册管理
  register,
  registerMany,
  unregister,
  
  // 查询
  get,
  list,
  listIds,
  findByName,
  
  // 默认装备
  loadDefaults,
  defaultsLoaded,
  
  // 统计
  getStats,
  generateReport,
  clear,
} from './registry';

// ============================================================================
// 加载器
// ============================================================================

export {
  // 加载
  load,
  loadMany,
  
  // 渲染
  render,
  loadAndRender,
  
  // 工具
  estimateTokens,
  getPatternInfo,
} from './loader';

export type {
  LoadResult,
  RenderResult,
} from './loader';

// ============================================================================
// 角色装备（直接导出）
// ============================================================================

export { SoyorinPattern } from './system/roles/Soyorin.pattern';
export { CucumberMuPattern } from './system/roles/CucumberMu.pattern';
export { TangYinPattern } from './system/roles/TangYin.pattern';
export { PressureMonsterPattern } from './system/roles/PressureMonster.pattern';
export { SupportXiaoXiangPattern } from './system/roles/SupportXiaoXiang.pattern';
export { GuGuGaGaPattern } from './system/roles/GuGuGaGa.pattern';
export { MilkDragonPattern } from './system/roles/MilkDragon.pattern';

// ============================================================================
// 便捷初始化
// ============================================================================

import { loadDefaults } from './registry';

/**
 * 初始化 Fabric 模块
 * 加载所有默认角色装备
 */
export async function initFabric(): Promise<{
  success: boolean;
  loadedCount: number;
  error?: string;
}> {
  try {
    const count = await loadDefaults();
    return {
      success: true,
      loadedCount: count,
    };
  } catch (error) {
    return {
      success: false,
      loadedCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 快速启动：同步初始化（使用预加载的角色）
 * 注意：此方法不加载默认装备，需要手动调用 loadDefaults()
 */
export function quickStart(): {
  ready: boolean;
  message: string;
} {
  return {
    ready: true,
    message: 'Fabric module ready. Call loadDefaults() to load role patterns.',
  };
}

// ============================================================================
// 版本信息
// ============================================================================

export const VERSION = '1.0.0';

export const FABRIC_INFO = {
  name: 'B-07 Fabric 装备模块',
  version: VERSION,
  description: '三层装备库：System | Context | Action',
  roles: [
    { id: 'sys:pm-soyorin', name: 'Soyorin', role: 'PM' },
    { id: 'sys:arch-cucumber-mu', name: '黄瓜睦', role: '架构师' },
    { id: 'sys:engineer-tang-yin', name: '唐音', role: '工程师' },
    { id: 'sys:qa-pressure-monster', name: '压力怪', role: '审计' },
    { id: 'sys:support-xiao-xiang', name: '客服小祥', role: '客服' },
    { id: 'sys:qa-gu-gu-ga-ga', name: '咕咕嘎嘎', role: 'QA' },
    { id: 'sys:audit-milk-dragon', name: '奶龙娘', role: '奶龙娘' },
  ],
};

// 默认导出
export default {
  VERSION,
  FABRIC_INFO,
  initFabric,
  quickStart,
};
