/**
 * Pattern Validator - Pattern验证器
 * 用于验证Pattern结构完整性和配置正确性
 * 
 * @version 1.0.0
 * @module lib/patterns/validator
 */

import { Pattern, PatternType, VariableDef, PatternConfig } from '@/patterns/types';

// ============================================================================
// 验证结果类型
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface TokenLimitConfig {
  role: string;
  expectedLimit: number;
  category: 'high' | 'standard';
}

// ============================================================================
// Token限制配置
// ============================================================================

export const TOKEN_LIMIT_RULES: Record<string, TokenLimitConfig> = {
  'sys:pm-soyorin': { role: 'PM', expectedLimit: 2000, category: 'high' },
  'sys:arch-cucumber-mu': { role: '架构师', expectedLimit: 2000, category: 'high' },
  'sys:engineer-tang-yin': { role: '工程师', expectedLimit: 2000, category: 'high' },
  'sys:qa-pressure-monster': { role: 'QA-压力怪', expectedLimit: 1500, category: 'standard' },
  'sys:support-xiao-xiang': { role: '客服', expectedLimit: 1500, category: 'standard' },
  'sys:qa-gu-gu-ga-ga': { role: 'QA-咕咕嘎嘎', expectedLimit: 1500, category: 'standard' },
  'sys:audit-milk-dragon': { role: '审计-奶龙娘', expectedLimit: 1500, category: 'standard' },
};

// 配置约束
export const CONFIG_CONSTRAINTS = {
  compressionRatio: 0.25,
  ttl: 3600000,
  highTokenLimit: 2000,
  standardTokenLimit: 1500,
};

// ============================================================================
// PatternValidator 类
// ============================================================================

export class PatternValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];

  /**
   * 完整验证Pattern
   * @param pattern - 要验证的Pattern
   * @returns 验证结果
   */
  validate(pattern: Pattern): ValidationResult {
    this.errors = [];
    this.warnings = [];

    // 基础字段验证
    this.validateBasicFields(pattern);
    
    // 类型验证
    this.validateType(pattern);
    
    // 配置验证
    this.validateConfig(pattern);
    
    // 变量定义验证
    this.validateVariables(pattern);
    
    // Token限制验证
    this.validateTokenLimit(pattern);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * 验证基础字段
   */
  private validateBasicFields(pattern: Pattern): void {
    // ID验证
    if (!pattern.id || typeof pattern.id !== 'string') {
      this.addError('id', 'Missing or invalid id', 'E001');
    } else if (!pattern.id.match(/^[a-z0-9:-]+$/)) {
      this.addWarning('id', 'ID format should be lowercase with colons', 'W001');
    }

    // 名称验证
    if (!pattern.name || typeof pattern.name !== 'string' || pattern.name.trim() === '') {
      this.addError('name', 'Missing or empty name', 'E002');
    }

    // 描述验证
    if (!pattern.description || typeof pattern.description !== 'string') {
      this.addWarning('description', 'Missing description', 'W002');
    }

    // 版本验证
    if (!pattern.version || typeof pattern.version !== 'string') {
      this.addError('version', 'Missing version', 'E003');
    } else if (!pattern.version.match(/^\d+\.\d+\.\d+$/)) {
      this.addWarning('version', 'Version should follow semver (x.y.z)', 'W003');
    }

    // 模板验证
    if (!pattern.template || typeof pattern.template !== 'string') {
      this.addError('template', 'Missing template', 'E004');
    } else if (pattern.template.trim() === '') {
      this.addError('template', 'Template cannot be empty', 'E005');
    }
  }

  /**
   * 验证类型
   */
  private validateType(pattern: Pattern): void {
    if (!pattern.type) {
      this.addError('type', 'Missing type', 'E006');
      return;
    }

    const validTypes = Object.values(PatternType);
    if (!validTypes.includes(pattern.type)) {
      this.addError('type', `Invalid type: ${pattern.type}. Must be one of: ${validTypes.join(', ')}`, 'E007');
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(pattern: Pattern): void {
    if (!pattern.config) {
      this.addError('config', 'Missing config', 'E008');
      return;
    }

    const config = pattern.config;

    // tokenLimit验证
    if (typeof config.tokenLimit !== 'number') {
      this.addError('config.tokenLimit', 'tokenLimit must be a number', 'E009');
    } else if (config.tokenLimit <= 0) {
      this.addError('config.tokenLimit', 'tokenLimit must be positive', 'E010');
    }

    // compressionRatio验证
    if (typeof config.compressionRatio !== 'number') {
      this.addError('config.compressionRatio', 'compressionRatio must be a number', 'E011');
    } else if (config.compressionRatio < 0 || config.compressionRatio > 1) {
      this.addError('config.compressionRatio', 'compressionRatio must be between 0 and 1', 'E012');
    } else if (config.compressionRatio !== CONFIG_CONSTRAINTS.compressionRatio) {
      this.addWarning(
        'config.compressionRatio',
        `Expected compressionRatio to be ${CONFIG_CONSTRAINTS.compressionRatio}, got ${config.compressionRatio}`,
        'W004'
      );
    }

    // cacheEnabled验证
    if (typeof config.cacheEnabled !== 'boolean') {
      this.addError('config.cacheEnabled', 'cacheEnabled must be a boolean', 'E013');
    }

    // TTL验证
    if (typeof config.ttl !== 'number') {
      this.addError('config.ttl', 'ttl must be a number', 'E014');
    } else if (config.ttl !== CONFIG_CONSTRAINTS.ttl) {
      this.addWarning(
        'config.ttl',
        `Expected ttl to be ${CONFIG_CONSTRAINTS.ttl}, got ${config.ttl}`,
        'W005'
      );
    }
  }

  /**
   * 验证变量定义
   */
  private validateVariables(pattern: Pattern): void {
    if (!Array.isArray(pattern.variables)) {
      this.addError('variables', 'variables must be an array', 'E015');
      return;
    }

    const varNames = new Set<string>();

    for (let i = 0; i < pattern.variables.length; i++) {
      const v = pattern.variables[i];
      const prefix = `variables[${i}]`;

      // 名称验证
      if (!v.name || typeof v.name !== 'string') {
        this.addError(`${prefix}.name`, 'Variable name is required', 'E016');
        continue;
      }

      // 重复名称检查
      if (varNames.has(v.name)) {
        this.addError(`${prefix}.name`, `Duplicate variable name: ${v.name}`, 'E017');
      }
      varNames.add(v.name);

      // 类型验证
      const validTypes = ['string', 'number', 'boolean', 'array', 'object'];
      if (!v.type || !validTypes.includes(v.type)) {
        this.addError(`${prefix}.type`, `Invalid type for ${v.name}. Must be one of: ${validTypes.join(', ')}`, 'E018');
      }

      // required验证
      if (typeof v.required !== 'boolean') {
        this.addError(`${prefix}.required`, `required must be a boolean for ${v.name}`, 'E019');
      }
    }

    // 检查模板中使用的变量是否都定义了
    this.validateTemplateVariables(pattern);
  }

  /**
   * 验证模板中的变量
   */
  private validateTemplateVariables(pattern: Pattern): void {
    const template = pattern.template;
    const varNames = new Set(pattern.variables.map(v => v.name));
    
    // 提取模板中的变量占位符 {{variableName}}
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    let match;
    const usedVars = new Set<string>();

    while ((match = regex.exec(template)) !== null) {
      usedVars.add(match[1]);
    }

    // 检查未定义的变量
    for (const varName of usedVars) {
      if (!varNames.has(varName)) {
        this.addWarning('template', `Variable "${varName}" used in template but not defined in variables`, 'W006');
      }
    }

    // 检查未使用的变量
    for (const v of pattern.variables) {
      if (!usedVars.has(v.name)) {
        this.addWarning('variables', `Variable "${v.name}" is defined but not used in template`, 'W007');
      }
    }
  }

  /**
   * 验证Token限制
   */
  validateTokenLimit(pattern: Pattern): boolean {
    const rule = TOKEN_LIMIT_RULES[pattern.id];
    
    if (!rule) {
      this.addWarning('id', `No token limit rule defined for pattern: ${pattern.id}`, 'W008');
      return true;
    }

    const actualLimit = pattern.config?.tokenLimit;
    
    if (actualLimit !== rule.expectedLimit) {
      this.addError(
        'config.tokenLimit',
        `Token limit mismatch for ${rule.role}: expected ${rule.expectedLimit}, got ${actualLimit}`,
        'E020'
      );
      return false;
    }

    return true;
  }

  /**
   * 批量验证
   */
  validateMany(patterns: Pattern[]): ValidationResult[] {
    return patterns.map(p => this.validate(p));
  }

  /**
   * 生成验证报告
   */
  generateReport(pattern: Pattern, result: ValidationResult): string {
    const lines: string[] = [];
    lines.push(`\n========================================`);
    lines.push(`Pattern Validation Report: ${pattern.id}`);
    lines.push(`========================================`);
    lines.push(`Name: ${pattern.name}`);
    lines.push(`Version: ${pattern.version}`);
    lines.push(`Type: ${pattern.type}`);
    lines.push(`----------------------------------------`);
    lines.push(`Status: ${result.valid ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`----------------------------------------`);

    if (result.errors.length > 0) {
      lines.push(`\nErrors (${result.errors.length}):`);
      for (const error of result.errors) {
        lines.push(`  ❌ [${error.code}] ${error.field}: ${error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push(`\nWarnings (${result.warnings.length}):`);
      for (const warning of result.warnings) {
        lines.push(`  ⚠️ [${warning.code}] ${warning.field}: ${warning.message}`);
      }
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      lines.push(`\n✅ All checks passed!`);
    }

    lines.push(`\n========================================\n`);
    return lines.join('\n');
  }

  /**
   * 添加错误
   */
  private addError(field: string, message: string, code: string): void {
    this.errors.push({ field, message, code });
  }

  /**
   * 添加警告
   */
  private addWarning(field: string, message: string, code: string): void {
    this.warnings.push({ field, message, code });
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速验证单个Pattern
 */
export function validatePattern(pattern: Pattern): ValidationResult {
  const validator = new PatternValidator();
  return validator.validate(pattern);
}

/**
 * 快速验证Token限制
 */
export function validateTokenLimit(pattern: Pattern): boolean {
  const validator = new PatternValidator();
  return validator.validateTokenLimit(pattern);
}

/**
 * 获取角色的期望Token限制
 */
export function getExpectedTokenLimit(patternId: string): number | null {
  return TOKEN_LIMIT_RULES[patternId]?.expectedLimit ?? null;
}

/**
 * 获取角色分类
 */
export function getRoleCategory(patternId: string): 'high' | 'standard' | null {
  return TOKEN_LIMIT_RULES[patternId]?.category ?? null;
}

// ============================================================================
// 默认导出
// ============================================================================

export default {
  PatternValidator,
  validatePattern,
  validateTokenLimit,
  getExpectedTokenLimit,
  getRoleCategory,
  TOKEN_LIMIT_RULES,
  CONFIG_CONSTRAINTS,
};
