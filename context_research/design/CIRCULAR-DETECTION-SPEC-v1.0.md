# 循环符号链接检测设计规范 v1.0

## 工单信息
- **工单编号**: B-06/09
- **负责人**: 咕咕嘎嘎-QA人格
- **版本**: v1.1.0
- **标准**: 3秒内完成循环检测

---

## 1. 设计目标

实现基于inode级别的循环符号链接检测器，确保在遍历文件系统时能够：
1. 准确检测循环引用（符号链接、硬链接导致的循环）
2. 在3秒内完成检测（RG-005）
3. 支持1000层深层嵌套目录不栈溢出（NG-005）
4. 保证并发访问下inode跟踪一致性（High-004）

---

## 2. 核心算法

### 2.1 inode追踪原理

```
文件系统inode唯一标识：
┌─────────────────────────────────────┐
│  inode键 = ${deviceId}:${inodeNumber} │
│  示例: "16777220:12345678"           │
└─────────────────────────────────────┘

检测逻辑：
1. 使用 lstatSync 获取文件状态
2. 提取 stat.dev (设备ID) + stat.ino (inode号)
3. 组合成唯一键存入 Set
4. 若键已存在 → 检测到循环
```

### 2.2 回溯机制

```
目录遍历路径：
A → B → C → D
      ↑______│ (符号链接指向B)

检测过程：
1. 访问A: 标记 inode_A
2. 访问B: 标记 inode_B
3. 访问C: 标记 inode_C
4. 访问D: 发现指向B的符号链接
5. 检查 inode_B 已存在 → 抛出 E1001
6. 回溯: 取消标记 inode_C, inode_B (离开分支时)
```

---

## 3. 类设计

### 3.1 CircularReferenceDetector

```typescript
class CircularReferenceDetector {
  // 核心状态
  private visitedInodes: Set<string>      // inode键集合
  private visitedRealPaths: Set<string>   // 真实路径集合（处理硬链接）
  private initialized: boolean            // 初始化状态标志
  
  // 配置选项
  private options: DetectorOptions
  private stats: TraversalStats
  
  // 核心方法
  check(filePath: string, stat?: Stats): void      // 循环检查
  markVisited(filePath: string, stat?: Stats): void   // 标记已访问
  unmarkVisited(filePath: string, stat?: Stats): void // 取消标记（回溯）
  detect(dirPath: string, depth?: number): DetectionResult  // 遍历检测
  reset(): void   // 重置状态
}
```

### 3.2 错误类定义

| 错误码 | 类名 | 说明 |
|--------|------|------|
| E1001 | CircularReferenceError | 检测到循环引用 |
| E1003 | NotInitializedError | 检测器未初始化 |
| E1004 | ValidationError | 参数验证失败 |

---

## 4. 关键实现细节

### 4.1 严格初始化（FIX-05-002）

```javascript
// 构造函数中强制初始化
constructor(options = {}) {
  this.visitedInodes = new Set();      // 显式初始化
  this.visitedRealPaths = new Set();   // 显式初始化
  this.initialized = true;              // 标记已初始化
  // ...
}

// 运行时检查
ensureInitialized() {
  if (!this.initialized) {
    throw new NotInitializedError('CircularReferenceDetector');
  }
  if (!this.visitedInodes) {
    throw new NotInitializedError('visitedInodes');
  }
}
```

### 4.2 超时控制（RG-005）

```javascript
// 3秒超时机制
const startTime = Date.now();
const TIMEOUT_MS = 3000;

function checkTimeout() {
  if (Date.now() - startTime > TIMEOUT_MS) {
    throw new Error('Detection timeout after 3s');
  }
}
```

### 4.3 防栈溢出（NG-005）

```javascript
// 1000层限制 + 尾递归优化
detect(dirPath, depth = 0) {
  // 深度限制
  if (depth > 1000) {
    return { hasCircular: false, maxDepthReached: true };
  }
  // ...
}
```

### 4.4 并发安全（High-004）

```javascript
// 使用实例级别的锁机制
this.detectionLock = false;

async detect(dirPath) {
  if (this.detectionLock) {
    throw new ConcurrencyError('CircularReferenceDetector');
  }
  this.detectionLock = true;
  try {
    // 执行检测
  } finally {
    this.detectionLock = false;
  }
}
```

---

## 5. 测试覆盖点

### 5.1 功能测试 (CF-007)

| 测试项 | 预期结果 |
|--------|----------|
| 简单循环链接 A→B→A | 抛出 E1001，标记 [CIRCULAR] |
| 多层循环 A→B→C→A | 正确检测循环路径 |
| 硬链接循环 | 通过 realpath 检测 |

### 5.2 性能测试 (RG-005)

| 测试项 | 标准 | 预期结果 |
|--------|------|----------|
| 大目录检测 | 10万文件 | < 3秒 |
| 超时处理 | 恶意深层链接 | 3秒后抛出超时错误 |

### 5.3 稳定性测试 (NG-005)

| 测试项 | 标准 | 预期结果 |
|--------|------|----------|
| 1000层嵌套 | 无循环 | 正常遍历，不栈溢出 |
| 2000层嵌套 | 超过限制 | 返回 maxDepthReached |

### 5.4 并发测试 (High-004)

| 测试项 | 预期结果 |
|--------|----------|
| 并发检测同一目录 | 第二个请求抛出 ConcurrencyError |
| inode集合一致性 | 并发访问数据正确 |

---

## 6. 债务声明

### DEBT-CIRC-001: Windows Junction点特殊处理

- **优先级**: P2
- **状态**: 待完善
- **描述**: Windows Junction点（目录符号链接的一种）需要特殊处理
- **影响**: Windows平台下某些特殊junction可能检测不准确
- **计划**: v1.2.0 版本中完善

---

## 7. Node.js fs模块依赖

### 7.1 使用的API

| API | 用途 |
|-----|------|
| `fs.lstatSync(path)` | 获取文件状态（不跟随符号链接） |
| `fs.statSync(path)` | 获取文件状态（跟随符号链接） |
| `fs.realpathSync(path)` | 获取真实路径 |
| `fs.readdirSync(path)` | 读取目录内容 |

### 7.2 Stat对象字段

```javascript
{
  dev: number,      // 设备ID
  ino: number,      // inode号
  mode: number,     // 权限模式
  nlink: number,    // 硬链接数
  uid: number,      // 用户ID
  gid: number,      // 组ID
  size: number,     // 文件大小
  // ... 时间戳字段
}
```

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-02-21 | 初始设计文档 |
| v1.1 | - | 集成超时控制与并发安全 |

---

## 9. 参考文档

- Node.js fs模块文档: https://nodejs.org/api/fs.html
- 工单 B-05: 内存安全设计
- 参考实现: `packages/hajimi-cli/src/utils/circular-detector.ts`
