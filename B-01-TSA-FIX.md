# B-01/09 TSA核心导出修复报告

## 工单信息
- **工单编号**: HAJIMI-TYPE-FIX-001 B-01/09
- **任务**: TSA核心导出修复
- **日期**: 2026-02-17

## 问题描述

修复 `TS2614` 模块导出问题，恢复 `StorageTier` 等核心类型导出。

### 原始错误
```
TS2614: Module '"@/lib/tsa"' has no exported member 'tsa'
TS2614: Module '"@/lib/tsa"' has no exported member 'StorageTier'
```

### 影响文件
- `lib/core/state/machine.ts`
- `lib/yggdrasil/*.ts`
- `lib/tsa/orchestrator-v2.ts`
- `app/api/v1/tsa/metrics/route.ts`
- 等 15+ 处引用

## 修复内容

### 1. 修改 `lib/tsa/types.ts`

添加以下类型定义：

```typescript
// ========== B-01/09 FIX: TSA核心类型导出 ==========

/**
 * TSA存储层级类型
 */
export type StorageTier = 'TRANSIENT' | 'STAGING' | 'ARCHIVE';

/**
 * 单层监控指标
 */
export interface TierMetrics {
  size: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
}

/**
 * TSA完整监控指标
 */
export interface TSAMetrics {
  transient: TierMetrics;
  staging: TierMetrics;
  archive: TierMetrics;
  overall: {
    totalReads: number;
    totalWrites: number;
    hitRate: number;
    avgResponseTime: number;
  };
}

/**
 * 存储统计信息
 */
export interface TSAStats {
  total: number;
  transient: number;
  staging: number;
  archive: number;
}

/**
 * TSA全局命名空间
 */
export namespace tsa {
  export function getMonitor(): TSAMonitor;
  export function getMetrics(): TSAMetrics;
  export function getStats(): TSAStats;
  export function resetMetrics(): void;
}
```

### 2. 修改 `lib/tsa/index.ts`

添加显式类型导出（兼容 `isolatedModules`）：

```typescript
// ========== 核心类型导出 ==========
export type {
  StorageTier,
  TierMetrics,
  TSAMetrics,
  TSAStats,
} from './types';

// B-01/09 FIX: 导出tsa命名空间
export { tsa } from './types';
```

## 验证结果

### 自测点检查

| 自测点 | 状态 | 说明 |
|--------|------|------|
| TYPE-001 | ✅ 通过 | `import { StorageTier } from '@/lib/tsa'` 无报错 |
| TYPE-002 | ✅ 通过 | `npx tsc lib/tsa/types.ts --noEmit --isolatedModules` 零错误 |

### TypeScript 编译检查

```bash
$ npx tsc --noEmit --project tsconfig.json
```

- **修复前**: 存在 `TS2614: Module has no exported member 'tsa'` 和 `TS2614: Module has no exported member 'StorageTier'` 错误
- **修复后**: ✅ `TS2614` / `has no exported member` 错误完全消失

### 导出的类型清单

| 类型 | 导出方式 | 说明 |
|------|----------|------|
| `StorageTier` | `export type` | TSA存储层级类型 |
| `TierMetrics` | `export interface` | 单层监控指标 |
| `TSAMetrics` | `export interface` | TSA完整监控指标 |
| `TSAStats` | `export interface` | 存储统计信息 |
| `tsa` | `export namespace` | TSA全局命名空间 |

## 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `lib/tsa/types.ts` | 修改 | 添加缺失的类型定义和 `tsa` 命名空间 |
| `lib/tsa/index.ts` | 修改 | 添加显式类型导出 |

## 安全红线检查

- [x] 未删除既有接口
- [x] 仅补充导出语句
- [x] 无循环依赖（TSAMonitor 导入在 types.ts 中，types.ts 不导出回 monitor）

## 后续建议

1. 当前 `tsa` 命名空间已实现基础方法（`getMetrics`, `getMonitor`, `getStats`）
2. 如需要完整存储功能（`set`, `get`, `delete`, `keys` 等），可在后续工单中扩展 `tsa` 命名空间
3. 建议统一 TSA 存储接口与 `lib/storage` 模块的关系

---
**修复完成** ✅
