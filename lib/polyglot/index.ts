/**
 * HAJIMI-PHASE2-IMPL-001: B-02/06
 * Polyglot 多语言切换引擎 - 主入口
 * 
 * 提供Node.js ↔ Python ↔ Go的秒级切换能力
 * @module lib/polyglot
 * 
 * 自测指标：
 * - POL-001：Node转Python准确率 > 95%
 * - POL-002：切换延迟 < 30s
 * - POL-003：类型丢失率 < 2%
 * 
 * 债务声明：
 * - 复杂JavaScript动态类型推断（P1）
 * - Go泛型支持（P2，Go<1.18降级处理）
 */

// IR核心
export * from './ir/ast';
export * from './ir/bnf';

// 转换器
export * from './transformer/node-to-ir';
export * from './transformer/ir-to-python';
export * from './transformer/ir-to-go';

// Fabric运行时
export * from './fabric/nodejs/fabric';
export * from './fabric/python/fabric.py';

// 热切换
export * from './hot-swap/blue-green';

import { Module } from './ir/ast';
import { NodeToIRTransformer, TransformOptions } from './transformer/node-to-ir';
import { IRToPythonGenerator, PythonGenOptions } from './transformer/ir-to-python';
import { IRToGoGenerator, GoGenOptions } from './transformer/ir-to-go';
import { BlueGreenManager, HotSwapConfig } from './hot-swap/blue-green';

/**
 * Polyglot引擎配置
 */
export interface PolyglotConfig {
  // 转换配置
  transform?: TransformOptions;
  python?: PythonGenOptions;
  go?: GoGenOptions;
  
  // 部署配置
  hotSwap?: Partial<HotSwapConfig>;
  
  // 运行时配置
  runtime: 'nodejs' | 'python' | 'go';
  target: 'nodejs' | 'python' | 'go';
}

/**
 * 转换结果
 */
export interface TransformResult {
  success: boolean;
  source: string;
  target: string;
  ir: Module;
  code: string;
  errors: string[];
  warnings: string[];
  stats: {
    accuracy: number;
    typeLoss: number;
    conversionTime: number;
  };
}

/**
 * Polyglot引擎 - 主类
 */
export class PolyglotEngine {
  private config: PolyglotConfig;
  private nodeTransformer: NodeToIRTransformer;
  private pythonGenerator: IRToPythonGenerator;
  private goGenerator: IRToGoGenerator;
  private blueGreenManager?: BlueGreenManager;
  
  constructor(config: PolyglotConfig) {
    this.config = config;
    this.nodeTransformer = new NodeToIRTransformer(config.transform);
    this.pythonGenerator = new IRToPythonGenerator(config.python);
    this.goGenerator = new IRToGoGenerator(config.go);
  }
  
  /**
   * 转换代码
   * @param sourceCode 源代码
   * @param fileName 文件名
   */
  transform(sourceCode: string, fileName?: string): TransformResult {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Step 1: 解析为IR
      const ir = this.nodeTransformer.transform(sourceCode, fileName);
      const stats = this.nodeTransformer.getStats();
      
      // Step 2: 生成目标代码
      let targetCode = '';
      switch (this.config.target) {
        case 'python':
          targetCode = this.pythonGenerator.generate(ir);
          break;
        case 'go':
          targetCode = this.goGenerator.generate(ir);
          break;
        case 'nodejs':
          targetCode = sourceCode; // 源到源
          break;
        default:
          errors.push(`Unsupported target: ${this.config.target}`);
      }
      
      const conversionTime = Date.now() - startTime;
      const accuracy = this.nodeTransformer.getAccuracy();
      
      return {
        success: errors.length === 0,
        source: this.config.runtime,
        target: this.config.target,
        ir,
        code: targetCode,
        errors,
        warnings,
        stats: {
          accuracy,
          typeLoss: 100 - accuracy,
          conversionTime,
        },
      };
      
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        source: this.config.runtime,
        target: this.config.target,
        ir: new Module(fileName || 'unknown'),
        code: '',
        errors,
        warnings,
        stats: {
          accuracy: 0,
          typeLoss: 100,
          conversionTime: Date.now() - startTime,
        },
      };
    }
  }
  
  /**
   * 初始化热切换
   */
  async initializeHotSwap(): Promise<void> {
    if (!this.blueGreenManager) {
      this.blueGreenManager = new BlueGreenManager(this.config.hotSwap);
    }
  }
  
  /**
   * 执行热切换
   * @param newVersion 新版本
   */
  async hotSwap(newVersion: string): Promise<boolean> {
    if (!this.blueGreenManager) {
      await this.initializeHotSwap();
    }
    
    try {
      const result = await this.blueGreenManager!.switch(newVersion);
      return result.success;
    } catch {
      return false;
    }
  }
  
  /**
   * 获取热切换管理器
   */
  getHotSwapManager(): BlueGreenManager | undefined {
    return this.blueGreenManager;
  }
}

/**
 * 快速转换函数
 */
export function transpile(
  sourceCode: string,
  source: 'nodejs' | 'typescript',
  target: 'python' | 'go',
  options?: Partial<PolyglotConfig>
): TransformResult {
  const engine = new PolyglotEngine({
    runtime: source === 'typescript' ? 'nodejs' : source,
    target,
    ...options,
  });
  
  return engine.transform(sourceCode);
}

/**
 * 版本信息
 */
export const VERSION = '1.0.0';

// 默认导出
export default {
  PolyglotEngine,
  transpile,
  VERSION,
};
