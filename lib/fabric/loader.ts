/**
 * Fabric装备加载器
 * 
 * 热插拔机制 + 冲突检测
 * 
 * @module lib/fabric/loader
 * @version 1.3.0
 */

import { Pattern, FabricEquipment, FabricLoaderConfig, ConflictCheckResult } from './types';
import { PatternSchema } from './types';

// ========== 装备加载器 ==========

export class FabricLoader {
  private equipments: Map<string, FabricEquipment> = new Map();
  private config: FabricLoaderConfig;

  constructor(config: Partial<FabricLoaderConfig> = {}) {
    this.config = {
      hotReload: true,
      validateOnLoad: true,
      maxPatterns: 50,
      conflictCheck: true,
      ...config,
    };
  }

  /**
   * 加载Pattern
   */
  load(pattern: Pattern): { success: boolean; error?: string } {
    // 检查容量
    if (this.equipments.size >= this.config.maxPatterns) {
      return { success: false, error: 'Max patterns limit reached' };
    }

    // 验证Pattern
    if (this.config.validateOnLoad) {
      const result = PatternSchema.safeParse(pattern);
      if (!result.success) {
        return { success: false, error: `Invalid pattern: ${result.error.message}` };
      }
    }

    // 冲突检测
    if (this.config.conflictCheck) {
      const conflicts = this.checkConflicts(pattern);
      if (conflicts.hasConflict) {
        return {
          success: false,
          error: `Conflicts detected: ${conflicts.conflicts.map((c) => c.reason).join(', ')}`,
        };
      }
    }

    // 创建装备
    const equipment: FabricEquipment = {
      pattern,
      loadedAt: Date.now(),
      status: 'active',
      lastUsed: 0,
      useCount: 0,
    };

    this.equipments.set(pattern.name, equipment);
    return { success: true };
  }

  /**
   * 卸载Pattern
   */
  unload(patternName: string): boolean {
    return this.equipments.delete(patternName);
  }

  /**
   * 获取装备
   */
  get(patternName: string): FabricEquipment | undefined {
    return this.equipments.get(patternName);
  }

  /**
   * 获取所有装备
   */
  getAll(): FabricEquipment[] {
    return Array.from(this.equipments.values());
  }

  /**
   * 获取按角色分组的装备
   */
  getByRole(role: Pattern['role']): FabricEquipment[] {
    return this.getAll().filter((eq) => eq.pattern.role === role);
  }

  /**
   * 使用装备
   */
  async use(patternName: string, context?: unknown): Promise<unknown> {
    const equipment = this.equipments.get(patternName);
    if (!equipment) {
      throw new Error(`Pattern not found: ${patternName}`);
    }

    if (equipment.status !== 'active') {
      throw new Error(`Pattern is not active: ${patternName}`);
    }

    try {
      equipment.lastUsed = Date.now();
      equipment.useCount++;
      
      return await equipment.pattern.action(context);
    } catch (error) {
      equipment.status = 'error';
      throw error;
    }
  }

  /**
   * 检查冲突
   */
  checkConflicts(newPattern: Pattern): ConflictCheckResult {
    const conflicts: ConflictCheckResult['conflicts'] = [];

    for (const [name, equipment] of this.equipments) {
      const pattern = equipment.pattern;

      // 检查互斥
      if (pattern.mutex.includes(newPattern.name) || newPattern.mutex.includes(pattern.name)) {
        conflicts.push({
          pattern1: pattern.name,
          pattern2: newPattern.name,
          reason: `Mutually exclusive: ${pattern.name} and ${newPattern.name}`,
        });
      }

      // 检查同名
      if (pattern.name === newPattern.name) {
        conflicts.push({
          pattern1: pattern.name,
          pattern2: newPattern.name,
          reason: `Duplicate pattern name: ${pattern.name}`,
        });
      }

      // 检查触发器冲突
      if (pattern.trigger === newPattern.trigger && pattern.role === newPattern.role) {
        conflicts.push({
          pattern1: pattern.name,
          pattern2: newPattern.name,
          reason: `Same trigger and role: ${pattern.trigger} / ${pattern.role}`,
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * 热重载
   */
  hotReload(patternName: string, newPattern: Pattern): { success: boolean; error?: string } {
    if (!this.config.hotReload) {
      return { success: false, error: 'Hot reload is disabled' };
    }

    if (!this.equipments.has(patternName)) {
      return { success: false, error: `Pattern not found: ${patternName}` };
    }

    // 先卸载再加载
    this.unload(patternName);
    return this.load(newPattern);
  }

  /**
   * 清空所有装备
   */
  clear(): void {
    this.equipments.clear();
  }
}

export default FabricLoader;
