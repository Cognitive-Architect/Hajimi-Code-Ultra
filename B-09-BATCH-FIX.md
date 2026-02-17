# B-09 批量修复报告

## 修复概述
将 `tsa.keys().filter()` 改为 `Array.from(tsa.keys()).filter()`，解决 TypeScript 类型错误。

## 修改文件列表

### 1. lib/yggdrasil/governance-rollback-service.ts
- **行号**: 242
- **修改前**: `const keys = tsa.keys().filter(k => k.startsWith(ROLLBACK_PROPOSAL_PREFIX));`
- **修改后**: `const keys = Array.from(tsa.keys()).filter((k: string) => k.startsWith(ROLLBACK_PROPOSAL_PREFIX));`
- **状态**: ✅ 已修复

### 2. lib/yggdrasil/git-rollback-adapter.ts
- **行号**: 197
- **修改前**: `const keys = tsa.keys().filter(k => k.startsWith('session:'));`
- **修改后**: `const keys = Array.from(tsa.keys()).filter((k: string) => k.startsWith('session:'));`
- **状态**: ✅ 已修复

### 3. lib/yggdrasil/branching-conflict-resolver.ts
- **行号**: 140
- **修改前**: `const keys = tsa.keys().filter((k: string) =>`
- **修改后**: `const keys = Array.from(tsa.keys()).filter((k: string) =>`
- **状态**: ✅ 已修复

### 4. lib/yggdrasil/branching-service.ts
- **行号**: 205, 286, 334（共3处）
- **修改前**: 
  - Line 205: `const keysToDelete = tsa.keys().filter(key =>`
  - Line 286: `const sourceKeys = tsa.keys().filter(key =>`
  - Line 334: `const sourceKeys = tsa.keys().filter(key =>`
- **修改后**: 
  - Line 205: `const keysToDelete = Array.from(tsa.keys()).filter((key: string) =>`
  - Line 286: `const sourceKeys = Array.from(tsa.keys()).filter((key: string) =>`
  - Line 334: `const sourceKeys = Array.from(tsa.keys()).filter((key: string) =>`
- **状态**: ✅ 已修复

## 修复统计

| 文件 | 修改行数 | 状态 |
|------|----------|------|
| governance-rollback-service.ts | 1 | ✅ |
| git-rollback-adapter.ts | 1 | ✅ |
| branching-conflict-resolver.ts | 1 | ✅ |
| branching-service.ts | 3 | ✅ |
| **总计** | **6** | ✅ |

## 关于 tsa.delete 调用

经检查，所有文件中的 `tsa.delete` 调用格式正确（`await tsa.delete(key)`），无需修改。

## 修复原因

`tsa.keys()` 返回的是可迭代对象（IterableIterator），而不是数组，因此没有 `filter` 方法。使用 `Array.from()` 将其转换为数组后再调用 `filter`。

---
修复完成时间: 2026-02-17
