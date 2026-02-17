# Hajimi Polyglot Engine

技术栈一键切换引擎（Node.js ↔ Python ↔ Go 秒级切换）

## 概览

Polyglot引擎提供语言无关的中间表示（Hajimi-IR）和双向转换器，支持三种主流语言间的代码转换。

## 文件结构

```
lib/polyglot/
├── index.ts                      # 主入口
├── ir/
│   ├── ast.ts    (~250行)        # Hajimi-IR AST节点定义
│   └── bnf.ts    (~150行)        # IR语法规范（BNF范式）
├── transformer/
│   ├── node-to-ir.ts  (~350行)   # Node.js → Hajimi-IR
│   ├── ir-to-python.ts (~350行)  # Hajimi-IR → Python
│   └── ir-to-go.ts    (~350行)   # Hajimi-IR → Go
├── fabric/
│   ├── nodejs/
│   │   └── fabric.ts  (~200行)   # Node.js Fabric模板
│   └── python/
│       └── fabric.py.ts (~200行) # Python Fabric模板
└── hot-swap/
    └── blue-green.ts  (~250行)   # 蓝绿热切换机制
```

## 快速开始

```typescript
import { PolyglotEngine, transpile } from './lib/polyglot';

// 方式1: 使用快捷函数
const result = transpile(
  `function greet(name: string) { return "Hello, " + name; }`,
  'typescript',
  'python'
);

console.log(result.code);
// 输出:
// def greet(name: str) -> str:
//     return "Hello, " + name

// 方式2: 使用引擎实例
const engine = new PolyglotEngine({
  runtime: 'nodejs',
  target: 'go',
});

const result = engine.transform(sourceCode);
console.log(`准确率: ${result.stats.accuracy}%`);
```

## 核心组件

### 1. IR (Intermediate Representation)

Hajimi-IR提供语言无关的AST表示：

- **ast.ts**: 完整的AST节点类型系统
  - 通用类型系统（TypeKind枚举）
  - 表达式、语句、函数、类、模块节点
  - SourceLocation源代码位置追踪

- **bnf.ts**: 语法规范定义
  - BNF范式语法定义
  - Parser/Printer接口
  - JSON/Text序列化支持

### 2. Transformer (转换器)

- **node-to-ir.ts**: TypeScript/JavaScript → IR
  - 基于ts-morph的AST解析
  - 类型推断（基本支持）
  - 准确率目标：>95%（POL-001）

- **ir-to-python.ts**: IR → Python
  - Python 3.9+类型注解
  - asyncio运行时适配
  - 标准库映射

- **ir-to-go.ts**: IR → Go
  - 结构体/接口转换
  - Go泛型支持（Go 1.18+）
  - 错误处理模式转换

### 3. Fabric (运行时适配器)

- **nodejs/fabric.ts**: Node.js运行时垫片
  - 标准库垫片（fs, http, crypto等）
  - 跨语言类型适配器
  - 健康检查机制

- **python/fabric.py.ts**: Python运行时模板
  - asyncio适配
  - Node.js API垫片
  - 类型映射定义

### 4. Hot-Swap (热切换)

- **blue-green.ts**: 蓝绿部署
  - 零停机部署
  - 健康检查与自动回滚
  - 切换延迟目标：<30s（POL-002）

## 自测指标

| 指标 | 目标 | 状态 |
|------|------|------|
| POL-001 | Node转Python准确率 > 95% | ✅ 实现中 |
| POL-002 | 切换延迟 < 30s | ✅ 实现中 |
| POL-003 | 类型丢失率 < 2% | ✅ 实现中 |

## 债务声明

- **P1**: 复杂JavaScript动态类型推断（基础版本已支持，复杂场景待完善）
- **P2**: Go泛型支持（Go<1.18自动降级处理）

## API参考

### PolyglotEngine

```typescript
class PolyglotEngine {
  constructor(config: PolyglotConfig);
  transform(sourceCode: string, fileName?: string): TransformResult;
  initializeHotSwap(): Promise<void>;
  hotSwap(newVersion: string): Promise<boolean>;
}
```

### TransformResult

```typescript
interface TransformResult {
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
```

### BlueGreenManager

```typescript
class BlueGreenManager {
  initialize(blue: InstanceConfig, green?: InstanceConfig): Promise<void>;
  switch(targetVersion: string): Promise<SwitchResult>;
  rollback(): Promise<void>;
  getActiveInstance(): Instance;
}
```

## 示例

### TypeScript → Python

```typescript
const tsCode = `
interface User {
  name: string;
  age: number;
}

async function getUser(id: number): Promise<User> {
  return { name: "Alice", age: 30 };
}
`;

const result = transpile(tsCode, 'typescript', 'python');
```

输出:
```python
from typing import TypedDict
from dataclasses import dataclass

class User(TypedDict):
    name: str
    age: int

async def get_user(id: int) -> User:
    return {"name": "Alice", "age": 30}
```

### TypeScript → Go

```typescript
const result = transpile(tsCode, 'typescript', 'go');
```

输出:
```go
package main

type User struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func GetUser(id int) (User, error) {
    return User{Name: "Alice", Age: 30}, nil
}
```

## 许可证

MIT License
