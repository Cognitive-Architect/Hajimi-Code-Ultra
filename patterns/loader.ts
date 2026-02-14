/**
 * Pattern Loader - 装备加载器
 * 支持动态加载和模板渲染
 * 
 * @version 1.0.0
 * @module patterns/loader
 */

import { Pattern, VariableDef } from './types';
import { register, get } from './registry';

// ============================================================================
// 加载结果类型
// ============================================================================

export interface LoadResult {
  success: boolean;
  pattern?: Pattern;
  error?: string;
}

export interface RenderResult {
  success: boolean;
  content?: string;
  error?: string;
  variables: Record<string, unknown>;
  missingVariables: string[];
}

// ============================================================================
// Pattern 加载
// ============================================================================

/**
 * 加载单个 Pattern
 * @param pattern - 要加载的 Pattern
 * @returns 加载结果
 */
export function load(pattern: Pattern): LoadResult {
  try {
    // 验证 Pattern
    const validation = validatePattern(pattern);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.error}`,
      };
    }

    // 检查依赖
    const depCheck = checkDependencies(pattern);
    if (!depCheck.valid) {
      return {
        success: false,
        error: `Dependency check failed: ${depCheck.missing?.join(', ')}`,
      };
    }

    // 注册到 registry
    register(pattern);

    return {
      success: true,
      pattern,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 批量加载 Patterns
 * @param patterns - Pattern 数组
 * @returns 加载结果数组
 */
export function loadMany(patterns: Pattern[]): LoadResult[] {
  return patterns.map(pattern => load(pattern));
}

// ============================================================================
// 模板渲染
// ============================================================================

/**
 * 渲染 Pattern 模板
 * @param pattern - Pattern 或 Pattern ID
 * @param variables - 变量值
 * @returns 渲染结果
 */
export function render(
  pattern: Pattern | string,
  variables: Record<string, unknown> = {}
): RenderResult {
  // 获取 Pattern
  let p: Pattern | undefined;
  if (typeof pattern === 'string') {
    p = get(pattern);
    if (!p) {
      return {
        success: false,
        error: `Pattern not found: ${pattern}`,
        variables,
        missingVariables: [],
      };
    }
  } else {
    p = pattern;
  }

  try {
    // 验证并填充变量
    const varResult = processVariables(p.variables, variables);
    const mergedVars = { ...varResult.defaults, ...variables };

    // 执行模板替换
    let content = p.template;
    const missingVars: string[] = [];

    // 查找所有变量占位符
    const placeholderRegex = /\{\{(\s*[\w]+\s*)\}\}/g;
    const matches = Array.from(content.matchAll(placeholderRegex));

    for (const match of matches) {
      const varName = match[1].trim();
      const value = mergedVars[varName];

      if (value === undefined) {
        missingVars.push(varName);
        continue;
      }

      // 替换占位符
      content = content.replace(match[0], String(value));
    }

    // 如果存在必填变量缺失，返回错误
    const requiredMissing = p.variables
      .filter(v => v.required && !(v.name in mergedVars))
      .map(v => v.name);

    if (requiredMissing.length > 0) {
      return {
        success: false,
        error: `Missing required variables: ${requiredMissing.join(', ')}`,
        variables: mergedVars,
        missingVariables: requiredMissing,
      };
    }

    // 应用压缩（如果启用）
    if (p.config.compressionRatio < 1) {
      content = compress(content, p.config.compressionRatio);
    }

    return {
      success: true,
      content,
      variables: mergedVars,
      missingVariables: missingVars,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      variables,
      missingVariables: [],
    };
  }
}

/**
 * 从文件加载并渲染（异步）
 * @param patternId - Pattern ID
 * @param variables - 变量值
 * @returns 渲染结果
 */
export async function loadAndRender(
  patternId: string,
  variables: Record<string, unknown> = {}
): Promise<RenderResult> {
  const pattern = get(patternId);
  
  if (!pattern) {
    return {
      success: false,
      error: `Pattern not found: ${patternId}`,
      variables,
      missingVariables: [],
    };
  }

  return render(pattern, variables);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证 Pattern
 */
function validatePattern(pattern: Pattern): { valid: boolean; error?: string } {
  if (!pattern.id) {
    return { valid: false, error: 'Missing id' };
  }
  if (!pattern.name) {
    return { valid: false, error: 'Missing name' };
  }
  if (!pattern.type) {
    return { valid: false, error: 'Missing type' };
  }
  if (!pattern.template) {
    return { valid: false, error: 'Missing template' };
  }
  if (!pattern.config) {
    return { valid: false, error: 'Missing config' };
  }

  return { valid: true };
}

/**
 * 检查依赖
 */
function checkDependencies(pattern: Pattern): { valid: boolean; missing?: string[] } {
  const missing: string[] = [];

  for (const depId of pattern.dependencies) {
    if (!get(depId)) {
      missing.push(depId);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  };
}

/**
 * 处理变量
 */
function processVariables(
  varDefs: VariableDef[],
  provided: Record<string, unknown>
): { defaults: Record<string, unknown>; missing: string[] } {
  const defaults: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const def of varDefs) {
    if (def.default !== undefined && !(def.name in provided)) {
      defaults[def.name] = def.default;
    }

    if (def.required && !(def.name in provided) && !(def.name in defaults)) {
      missing.push(def.name);
    }
  }

  return { defaults, missing };
}

/**
 * 压缩内容
 */
function compress(content: string, ratio: number): string {
  // 简单的压缩逻辑：移除多余空白和注释
  if (ratio >= 1) return content;

  return content
    .replace(/\/\/.*$/gm, '') // 移除单行注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
    .replace(/\n\s*\n/g, '\n') // 移除空行
    .replace(/[ \t]+/g, ' ') // 合并空白
    .trim();
}

// ============================================================================
// 统计
// ============================================================================

/**
 * 估算 Token 数量
 * @param content - 内容
 * @returns 估算的 token 数
 */
export function estimateTokens(content: string): number {
  // 简化估算：每4个字符约1个token
  return Math.ceil(content.length / 4);
}

/**
 * 获取 Pattern 信息
 * @param patternId - Pattern ID
 */
export function getPatternInfo(patternId: string): {
  id: string;
  exists: boolean;
  tokenLimit?: number;
  estimatedTokens?: number;
} | null {
  const pattern = get(patternId);
  
  if (!pattern) {
    return { id: patternId, exists: false };
  }

  return {
    id: patternId,
    exists: true,
    tokenLimit: pattern.config.tokenLimit,
    estimatedTokens: estimateTokens(pattern.template),
  };
}

// ============================================================================
// 默认导出
// ============================================================================

export default {
  load,
  loadMany,
  render,
  loadAndRender,
  estimateTokens,
  getPatternInfo,
};
