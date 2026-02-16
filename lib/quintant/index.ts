/**
 * Quintant 服务模块入口
 * 
 * 导出所有类型、Schema、适配器和服务类
 * 
 * @module lib/quintant
 * @version 1.3.0
 */

// ========== 类型导出 ==========
export * from './types';

// ========== 服务类导出 ==========
export { QuintantService, createQuintantService } from './standard-interface';

// ========== 适配器导出 ==========
export { MockAdapter } from './adapters/mock';
export { SecondMeAdapter } from './adapters/secondme';

// ========== 默认导出 ==========
export { default } from './standard-interface';
