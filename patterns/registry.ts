/**
 * Pattern Registry - 装备注册中心
 * 管理所有装备的注册、查询和版本控制
 * 
 * @version 1.0.0
 * @module patterns/registry
 */

import { Pattern, PatternType } from './types';

// ============================================================================
// 注册表存储
// ============================================================================

const registry = new Map<string, Pattern>();
let isDefaultsLoaded = false;

// ============================================================================
// 核心注册方法
// ============================================================================

/**
 * 注册 Pattern
 * @param pattern - 要注册的 Pattern
 * @returns 是否注册成功
 */
export function register(pattern: Pattern): boolean {
  if (registry.has(pattern.id)) {
    console.warn(`[Registry] Pattern ${pattern.id} already exists, overwriting...`);
  }

  // 验证 Pattern 完整性
  if (!validatePattern(pattern)) {
    console.error(`[Registry] Invalid pattern: ${pattern.id}`);
    return false;
  }

  registry.set(pattern.id, pattern);
  console.log(`[Registry] Registered: ${pattern.id} (${pattern.type})`);
  return true;
}

/**
 * 批量注册 Patterns
 * @param patterns - Pattern 数组
 * @returns 成功注册的数量
 */
export function registerMany(patterns: Pattern[]): number {
  let count = 0;
  for (const pattern of patterns) {
    if (register(pattern)) {
      count++;
    }
  }
  return count;
}

/**
 * 注销 Pattern
 * @param id - Pattern ID
 * @returns 是否注销成功
 */
export function unregister(id: string): boolean {
  if (!registry.has(id)) {
    console.warn(`[Registry] Pattern not found: ${id}`);
    return false;
  }

  registry.delete(id);
  console.log(`[Registry] Unregistered: ${id}`);
  return true;
}

// ============================================================================
// 查询方法
// ============================================================================

/**
 * 获取 Pattern
 * @param id - Pattern ID
 * @returns Pattern 或 undefined
 */
export function get(id: string): Pattern | undefined {
  return registry.get(id);
}

/**
 * 列出所有 Patterns
 * @param type - 可选的类型过滤
 * @returns Pattern 数组
 */
export function list(type?: PatternType): Pattern[] {
  const patterns = Array.from(registry.values());
  
  if (type) {
    return patterns.filter(p => p.type === type);
  }
  
  return patterns;
}

/**
 * 列出所有 Pattern ID
 * @returns ID 数组
 */
export function listIds(): string[] {
  return Array.from(registry.keys());
}

/**
 * 按名称搜索 Patterns
 * @param name - 名称关键字
 * @returns 匹配的 Pattern 数组
 */
export function findByName(name: string): Pattern[] {
  const lowerName = name.toLowerCase();
  return Array.from(registry.values()).filter(
    p => p.name.toLowerCase().includes(lowerName)
  );
}

// ============================================================================
// 默认装备加载
// ============================================================================

/**
 * 加载默认角色装备
 * 加载所有 7 个内置角色装备
 */
export async function loadDefaults(): Promise<number> {
  if (isDefaultsLoaded) {
    console.log('[Registry] Default patterns already loaded');
    return 0;
  }

  const loaded: Pattern[] = [];

  try {
    // 动态导入所有角色装备
    const roles = await Promise.all([
      import('./system/roles/Soyorin.pattern'),
      import('./system/roles/CucumberMu.pattern'),
      import('./system/roles/TangYin.pattern'),
      import('./system/roles/PressureMonster.pattern'),
      import('./system/roles/SupportXiaoXiang.pattern'),
      import('./system/roles/GuGuGaGa.pattern'),
      import('./system/roles/MilkDragon.pattern'),
    ]);

    for (const module of roles) {
      const pattern = module.default || module;
      if (pattern && pattern.id) {
        loaded.push(pattern as Pattern);
      }
    }

    // 注册所有加载的装备
    const count = registerMany(loaded);
    isDefaultsLoaded = true;
    
    console.log(`[Registry] Loaded ${count} default patterns`);
    return count;
  } catch (error) {
    console.error('[Registry] Failed to load default patterns:', error);
    return 0;
  }
}

/**
 * 检查默认装备是否已加载
 */
export function defaultsLoaded(): boolean {
  return isDefaultsLoaded;
}

// ============================================================================
// 统计信息
// ============================================================================

/**
 * 获取注册表统计信息
 */
export function getStats(): {
  total: number;
  byType: Record<PatternType, number>;
} {
  const byType: Record<PatternType, number> = {
    [PatternType.SYSTEM]: 0,
    [PatternType.CONTEXT]: 0,
    [PatternType.ACTION]: 0,
  };

  for (const pattern of registry.values()) {
    byType[pattern.type]++;
  }

  return {
    total: registry.size,
    byType,
  };
}

/**
 * 生成注册表报告
 */
export function generateReport(): string {
  const stats = getStats();
  const patterns = list();

  let report = `\n========================================\n`;
  report += `Pattern Registry Report\n`;
  report += `========================================\n\n`;
  report += `Total Patterns: ${stats.total}\n\n`;
  report += `By Type:\n`;
  report += `  - System: ${stats.byType[PatternType.SYSTEM]}\n`;
  report += `  - Context: ${stats.byType[PatternType.CONTEXT]}\n`;
  report += `  - Action: ${stats.byType[PatternType.ACTION]}\n\n`;
  report += `Registered Patterns:\n`;
  
  for (const p of patterns) {
    report += `  - [${p.type}] ${p.id}: ${p.name} (v${p.version})\n`;
  }
  
  report += `\n========================================\n`;
  
  return report;
}

// ============================================================================
// 验证
// ============================================================================

/**
 * 验证 Pattern 完整性
 */
function validatePattern(pattern: Pattern): boolean {
  if (!pattern.id || typeof pattern.id !== 'string') return false;
  if (!pattern.name || typeof pattern.name !== 'string') return false;
  if (!pattern.type || !Object.values(PatternType).includes(pattern.type)) return false;
  if (!pattern.template || typeof pattern.template !== 'string') return false;
  if (!pattern.variables || !Array.isArray(pattern.variables)) return false;
  if (!pattern.dependencies || !Array.isArray(pattern.dependencies)) return false;
  if (!pattern.config || typeof pattern.config !== 'object') return false;
  
  // 验证 config 字段
  const config = pattern.config;
  if (typeof config.tokenLimit !== 'number') return false;
  if (typeof config.compressionRatio !== 'number') return false;
  if (typeof config.cacheEnabled !== 'boolean') return false;
  if (typeof config.ttl !== 'number') return false;
  
  return true;
}

// ============================================================================
// 清空注册表
// ============================================================================

/**
 * 清空所有注册的 Patterns
 */
export function clear(): void {
  registry.clear();
  isDefaultsLoaded = false;
  console.log('[Registry] All patterns cleared');
}

// ============================================================================
// 默认导出
// ============================================================================

export default {
  register,
  registerMany,
  unregister,
  get,
  list,
  listIds,
  findByName,
  loadDefaults,
  defaultsLoaded,
  getStats,
  generateReport,
  clear,
};
