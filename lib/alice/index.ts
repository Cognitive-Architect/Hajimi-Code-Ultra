/**
 * Alice模块入口
 * HAJIMI-LCR-ENTITY-001 B-06/09 实体化版本
 * 
 * @module lib/alice
 * @version 1.4.0
 * 
 * 导出模块:
 * - mouse-tracker: 鼠标轨迹跟踪器 (P0已完成)
 * - ml-engine: ML引擎接口
 * - feature-extractor: 12维特征提取器 (B-06/09 实体化)
 * - onnx-runtime: ONNX Runtime推理引擎 (B-06/09 实体化)
 * 
 * DEBT:
 * - DEBT-ALICE-ML-001: 模型权重随机初始化 (Mock模式)
 * - DEBT-ENTITY-ALICE-002: P2 - 待替换为真实训练模型
 */

// 原有导出
export * from './mouse-tracker';
export * from './ml-engine';

// B-06/09 实体化新增导出
export * from './feature-extractor';
export * from './onnx-runtime';

// 默认导出
export { default } from './mouse-tracker';
