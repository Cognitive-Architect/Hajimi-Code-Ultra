# HAJIMI-v2.0-alpha 迁移指南

> **版本**: v2.0-alpha  
> **适用迁移**: v1.5.1-alpha → v2.0-alpha  
> **发布日期**: 2026-02-17  
> **迁移复杂度**: 中等  

---

## 一、迁移概述

### 1.1 版本变更摘要

| 项目 | v1.5.1-alpha | v2.0-alpha | 变更 |
|:-----|:-------------|:-----------|:-----|
| 核心架构 | 单线 | 六线并行 | 🔴 重大 |
| 代码行数 | ~50,000 | ~72,397 | 🟡 新增 |
| 新增模块 | 0 | 6个 | 🟡 新增 |
| API变更 | 无 | 向后兼容 | 🟢 兼容 |
| 配置格式 | 兼容 | 兼容 | 🟢 兼容 |
| 数据格式 | 兼容 | 兼容 | 🟢 兼容 |

### 1.2 迁移影响评估

| 组件 | 影响等级 | 说明 |
|:-----|:--------:|:-----|
| 核心API | 🟢 低 | 无破坏性变更 |
| 配置文件 | 🟢 低 | 向后兼容 |
| 数据存储 | 🟢 低 | 无数据迁移需求 |
| 依赖项 | 🟡 中 | 新增六线依赖 |
| 构建流程 | 🟡 中 | 构建时间增加 |
| 系统资源 | 🟡 中 | 内存/CPU需求增加 |

---

## 二、破坏性变更说明

### 2.1 破坏性变更清单

| 变更ID | 描述 | 影响 | 迁移操作 |
|:-------|:-----|:-----|:---------|
| BREAK-001 | 新增6个核心模块 | 包体积+15MB | 按需安装 |
| BREAK-002 | Node.js版本要求 | 需≥v18 | 升级Node |
| BREAK-003 | 构建命令变更 | 新增六线构建 | 更新脚本 |

### 2.2 详细变更说明

#### BREAK-001: 新增六线模块

v2.0-alpha 新增以下模块：

```
lib/lcr/        # 路线A: 本地上下文运行时
lib/polyglot/   # 路线B: 多语言互转
lib/mcp/        # 路线C: MCP协议宿主
lib/claw/       # 路线D: 情报抓取
desktop/        # 路线E: 桌面应用
lib/autopay/    # 路线F: 债务自动化
```

**影响**: 
- 安装包体积增加约15MB
- 首次构建时间增加约30%
- 运行时内存占用增加约20%

**缓解措施**:
- 按需安装依赖（仅启用需要的路线）
- 使用增量构建
- 启用代码分割

#### BREAK-002: Node.js版本要求

| 版本 | 状态 | 说明 |
|:-----|:----:|:-----|
| Node.js < 18 | ❌ 不支持 | 需升级 |
| Node.js 18.x | ✅ 支持 | 最低要求 |
| Node.js 20.x | ✅ 推荐 | 最佳性能 |

#### BREAK-003: 构建命令变更

```bash
# v1.5.1-alpha 构建命令
npm run build

# v2.0-alpha 构建命令（向后兼容）
npm run build          # 构建所有路线
npm run build:lcr      # 仅构建路线A
npm run build:polyglot # 仅构建路线B
npm run build:mcp      # 仅构建路线C
npm run build:claw     # 仅构建路线D
npm run build:desktop  # 仅构建路线E
npm run build:autopay  # 仅构建路线F
```

---

## 三、升级步骤

### 3.1 升级前准备

#### 步骤1: 备份当前环境

```bash
# 备份当前代码
cp -r hajimi-code-ultra hajimi-code-ultra-backup-v1.5.1

# 备份配置文件
cp package.json package.json.backup
cp tsconfig.json tsconfig.json.backup

# 记录当前版本
git log --oneline -1 > version-backup.txt
```

#### 步骤2: 检查系统要求

```bash
# 检查Node.js版本
node --version
# 要求: v18.0.0 或更高

# 检查npm版本
npm --version
# 要求: v9.0.0 或更高

# 检查Git版本
git --version
# 要求: v2.30.0 或更高
```

### 3.2 执行升级

#### 步骤3: 切换到v2.0-alpha

```bash
# 获取最新Tag
git fetch origin --tags

# 切换到v2.0-alpha
git checkout v2.0-alpha

# 验证切换成功
git log --oneline -1
# 应显示: release: v2.0-alpha 六线会师...
```

#### 步骤4: 安装依赖

```bash
# 清理旧依赖
rm -rf node_modules package-lock.json

# 安装新依赖
npm install

# 验证安装
npm ls --depth=0
```

#### 步骤5: 验证安装

```bash
# TypeScript检查
npx tsc --noEmit

# 单元测试
npm test

# Lint检查
npm run lint
```

### 3.3 配置迁移

#### 步骤6: 更新配置文件

```bash
# 合并自定义配置（如有）
# package.json 和 tsconfig.json 已自动更新

# 验证配置文件
cat package.json | grep version
# 应显示: "version": "2.0.0-alpha"
```

#### 步骤7: 环境变量更新

```bash
# .env 文件需添加以下变量（如使用对应路线）

# 路线A - LCR
HCTX_COMPRESSION=bsdiff
LCR_MEMORY_LIMIT=128M

# 路线B - Polyglot
POLYGLOT_TARGET_LANG=python
HOTSWAP_WARMUP_TIME=10

# 路线C - MCP
MCP_SANDBOX_LEVEL=R3
MCP_FUSE_THRESHOLD=5

# 路线D - Claw
CLAW_GITHUB_TOKEN=xxx
CLAW_BILIBILI_SESSDATA=xxx

# 路线F - AutoPay
AUTOPAY_BUDGET_LIMIT=1000
AUTOPAY_ALERT_THRESHOLD=80
```

### 3.4 验证升级

#### 步骤8: 功能验证

```bash
# 启动开发服务器
npm run dev

# 验证各路线功能
# 路线A: 访问 http://localhost:3000/api/lcr/health
# 路线B: 访问 http://localhost:3000/api/polyglot/health
# 路线C: 访问 http://localhost:3000/api/mcp/health
# 路线D: 访问 http://localhost:3000/api/claw/health
# 路线F: 访问 http://localhost:3000/api/autopay/health
```

#### 步骤9: 运行测试套件

```bash
# 完整测试
npm run test:full

# 仅核心测试
npm run test:core

# 各路线测试
npm run test:lcr
npm run test:polyglot
npm run test:mcp
npm run test:claw
npm run test:desktop
npm run test:autopay
```

---

## 四、回滚方案

### 4.1 快速回滚

```bash
# 步骤1: 停止服务
npm run stop

# 步骤2: 切换回v1.5.1-alpha
git checkout v1.5.1-alpha

# 步骤3: 恢复依赖
rm -rf node_modules package-lock.json
npm install

# 步骤4: 启动服务
npm run dev
```

### 4.2 数据回滚

v2.0-alpha 与 v1.5.1-alpha 数据格式兼容，无需数据回滚。

### 4.3 配置回滚

```bash
# 恢复备份的配置文件
cp package.json.backup package.json
cp tsconfig.json.backup tsconfig.json

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

---

## 五、常见问题

### Q1: 构建失败，提示内存不足

**原因**: 六线同时构建内存需求增加

**解决**:
```bash
# 增加Node内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build

# 或分路线构建
npm run build:lcr
npm run build:polyglot
# ... 依次构建
```

### Q2: TypeScript类型错误

**原因**: 类型定义更新

**解决**:
```bash
# 清理缓存
rm -rf node_modules/.cache

# 重新生成类型
npx tsc --build --force
```

### Q3: 某些路线不需要，如何禁用

**解决**:
```json
// package.json
{
  "hajimi": {
    "routes": {
      "lcr": true,
      "polyglot": false,  // 禁用
      "mcp": true,
      "claw": true,
      "desktop": false,   // 禁用
      "autopay": true
    }
  }
}
```

### Q4: 桌面应用启动失败

**原因**: Electron版本更新

**解决**:
```bash
# 清理Electron缓存
rm -rf ~/.cache/electron

# 重新安装
cd desktop
npm install
npm run electron:build
```

---

## 六、新特性启用指南

### 6.1 启用路线A - LCR

```typescript
// 配置LCR
import { LCREngine } from 'lib/lcr';

const engine = new LCREngine({
  memory: {
    focusLimit: 8192,
    workingLimit: 131072
  },
  gc: {
    enabled: true,
    level: 'predictive'
  }
});
```

### 6.2 启用路线B - Polyglot

```typescript
// 配置Polyglot
import { PolyglotTransformer } from 'lib/polyglot';

const transformer = new PolyglotTransformer({
  source: 'typescript',
  target: 'python',
  hotSwap: true
});

const result = await transformer.transform(sourceCode);
```

### 6.3 启用路线C - MCP

```typescript
// 配置MCP Host
import { AliceMCPHost } from 'lib/mcp';

const host = new AliceMCPHost({
  sandbox: {
    level: 'R3',
    fuseEnabled: true
  }
});

await host.connectServer('filesystem');
```

### 6.4 启用路线D - Claw

```typescript
// 配置Claw
import { ClawEngine } from 'lib/claw';

const claw = new ClawEngine({
  sources: ['github', 'rss'],
  dedup: {
    algorithm: 'simhash',
    threshold: 3
  }
});

await claw.start();
```

### 6.5 启用路线F - AutoPay

```typescript
// 配置AutoPay
import { AutoPayDashboard } from 'lib/autopay';

const dashboard = new AutoPayDashboard({
  budget: {
    monthly: 1000,
    alertThreshold: 80
  },
  audit: {
    mode: 'STRICT',
    autoMerge: true
  }
});

await dashboard.initialize();
```

---

## 七、验证清单

### 7.1 升级验证

| 检查项 | 命令 | 预期结果 |
|:-------|:-----|:---------|
| 版本检查 | `npm list hajimi` | v2.0.0-alpha |
| 构建检查 | `npm run build` | 成功 |
| 测试检查 | `npm test` | 全通过 |
| 类型检查 | `npx tsc --noEmit` | 0 errors |

### 7.2 功能验证

| 功能 | 验证方法 | 预期结果 |
|:-----|:---------|:---------|
| API服务 | `curl /api/health` | 200 OK |
| 六线状态 | `curl /api/status` | 6 routes ready |
| 监控面板 | 访问 `/dashboard` | 正常显示 |

---

## 八、获取帮助

### 8.1 文档资源

| 资源 | 路径 |
|:-----|:-----|
| API文档 | `docs/api/v2.0-alpha.md` |
| 配置指南 | `docs/config/v2.0-alpha.md` |
| 故障排查 | `docs/troubleshooting.md` |

### 8.2 社区支持

- GitHub Issues: https://github.com/hajimi/code-ultra/issues
- 技术文档: https://docs.hajimi.local/v2.0-alpha
- 迁移支持: migration@hajimi.local

---

## 九、迁移确认

### 9.1 迁移完成检查表

| 步骤 | 任务 | 状态 |
|:----:|:-----|:----:|
| 1 | 备份v1.5.1-alpha | ⬜ |
| 2 | 检查系统要求 | ⬜ |
| 3 | 切换到v2.0-alpha | ⬜ |
| 4 | 安装依赖 | ⬜ |
| 5 | 更新配置 | ⬜ |
| 6 | 验证构建 | ⬜ |
| 7 | 运行测试 | ⬜ |
| 8 | 验证功能 | ⬜ |

### 9.2 签字确认

| 角色 | 姓名 | 迁移确认 | 签字 | 日期 |
|:-----|:-----|:---------|:----:|:----:|
| 系统管理员 | - | 升级完成 | ⬜ | - |
| 开发人员 | - | 功能正常 | ⬜ | - |
| 测试人员 | - | 测试通过 | ⬜ | - |

---

**文档结束**

> **注意**: 请在完成每个步骤后在检查表中打 ✅ 确认。
