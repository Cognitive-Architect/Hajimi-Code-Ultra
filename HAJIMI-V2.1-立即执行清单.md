# HAJIMI-SKILLS V2.1 立即执行清单
> 版本: v1.0 | 日期: 2026-02-13 | 接收方: Atoms施工团队

---

## 执行概览

| 属性 | 值 |
|------|-----|
| **项目名称** | HAJIMI-SKILLS V2.1 归零重建 |
| **总工期** | 36天 |
| **开始日期** | Day 1 (立即执行) |
| **代码复用率** | 53% |
| **总架构师裁决** | 可行 |

---

## Day 1 立即执行任务

### 🔴 P0 - 最高优先级 (必须今天完成)

#### 任务 D1-001: 执行技术债务清算
```bash
# 执行脚本
chmod +x /mnt/okcomputer/output/delete_legacy.sh
./delete_legacy.sh
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-001 |
| **任务名称** | 执行技术债务清算 |
| **执行脚本** | `delete_legacy.sh` |
| **预计耗时** | 30分钟 |
| **验收标准** | P0级债务组件全部删除 |
| **责任人** | DevOps工程师 |

**执行步骤**:
1. 备份原项目代码
2. 执行delete_legacy.sh脚本
3. 验证删除结果
4. 提交删除记录

---

#### 任务 D1-002: 初始化Next.js 15项目
```bash
# 创建项目
npx create-next-app@latest skills-v2.1 \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd skills-v2.1
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-002 |
| **任务名称** | 初始化Next.js 15项目 |
| **预计耗时** | 15分钟 |
| **验收标准** | 项目创建成功，可运行 |
| **责任人** | 前端工程师 |

**执行步骤**:
1. 执行create-next-app命令
2. 等待依赖安装完成
3. 运行 `npm run dev` 验证
4. 访问 http://localhost:3000 确认

---

#### 任务 D1-003: 配置TypeScript严格模式
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-003 |
| **任务名称** | 配置TypeScript严格模式 |
| **预计耗时** | 10分钟 |
| **验收标准** | `npx tsc --noEmit` 无错误 |
| **责任人** | 前端工程师 |

---

#### 任务 D1-004: 创建目录结构
```bash
# 创建目录
mkdir -p app/{(routes),api/v1/{a2a,state,governance,coze},components/ui,hooks,lib}
mkdir -p components/ui
mkdir -p config/{governance,state,patterns}
mkdir -p lib/{types,protocols/a2a,core/{agents,state,governance},tsa,patterns/{system/roles,context,action},plugins/{adapters,slots}}
mkdir -p tests/{unit,integration,e2e}
mkdir -p public
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-004 |
| **任务名称** | 创建目录结构 |
| **预计耗时** | 10分钟 |
| **验收标准** | 所有目录创建完成 |
| **责任人** | 前端工程师 |

---

#### 任务 D1-005: 迁移UI组件
```bash
# 迁移命令
mkdir -p app/components/ui

# 迁移六Agent UI组件
cp src/components/ui/AgentChatDialog.tsx app/components/ui/
cp src/components/ui/A2AMessageFeed.tsx app/components/ui/
cp src/components/ui/ProposalPanel.tsx app/components/ui/
cp src/components/ui/StateIndicator.tsx app/components/ui/
cp src/components/ui/DemoController.tsx app/components/ui/
cp src/components/ui/DemoPanel.tsx app/components/ui/
cp src/components/ui/index.ts app/components/ui/
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-005 |
| **任务名称** | 迁移六Agent UI组件 |
| **预计耗时** | 30分钟 |
| **验收标准** | 6个组件全部迁移，无错误 |
| **责任人** | 前端工程师 |

**迁移清单**:
| 组件 | 源路径 | 目标路径 | 状态 |
|------|--------|----------|------|
| AgentChatDialog | src/components/ui/ | app/components/ui/ | ⏳ |
| A2AMessageFeed | src/components/ui/ | app/components/ui/ | ⏳ |
| ProposalPanel | src/components/ui/ | app/components/ui/ | ⏳ |
| StateIndicator | src/components/ui/ | app/components/ui/ | ⏳ |
| DemoController | src/components/ui/ | app/components/ui/ | ⏳ |
| DemoPanel | src/components/ui/ | app/components/ui/ | ⏳ |

---

#### 任务 D1-006: 迁移类型定义
```bash
# 迁移类型定义
mkdir -p lib/types

cp src/lib/protocols/a2a/types.ts lib/types/a2a.ts
cp src/lib/state/types.ts lib/types/state.ts
cp src/lib/agents/types.ts lib/types/agent.ts

# 创建统一导出
cat > lib/types/index.ts << 'EOF'
export * from './a2a';
export * from './state';
export * from './agent';
EOF
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-006 |
| **任务名称** | 迁移类型定义 |
| **预计耗时** | 20分钟 |
| **验收标准** | 类型定义完整，无类型错误 |
| **责任人** | 前端工程师 |

---

#### 任务 D1-007: 安装依赖
```bash
# 进入项目目录
cd skills-v2.1

# 安装核心依赖
npm install zod uuid idb

# 安装开发依赖
npm install -D @types/uuid @types/node

# 验证安装
npm list zod uuid idb
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-007 |
| **任务名称** | 安装项目依赖 |
| **预计耗时** | 10分钟 |
| **验收标准** | 所有依赖安装成功 |
| **责任人** | 前端工程师 |

---

#### 任务 D1-008: 首次构建验证
```bash
# 构建项目
npm run build

# 验证结果
echo "构建状态: $?"
```

| 属性 | 值 |
|------|-----|
| **任务ID** | D1-008 |
| **任务名称** | 首次构建验证 |
| **预计耗时** | 5分钟 |
| **验收标准** | 构建成功，无错误 |
| **责任人** | 前端工程师 |

---

## Day 1 任务汇总

| 序号 | 任务ID | 任务名称 | 预计耗时 | 优先级 | 责任人 |
|------|--------|----------|----------|--------|--------|
| 1 | D1-001 | 执行技术债务清算 | 30分钟 | 🔴 P0 | DevOps |
| 2 | D1-002 | 初始化Next.js 15项目 | 15分钟 | 🔴 P0 | 前端 |
| 3 | D1-003 | 配置TypeScript严格模式 | 10分钟 | 🔴 P0 | 前端 |
| 4 | D1-004 | 创建目录结构 | 10分钟 | 🔴 P0 | 前端 |
| 5 | D1-005 | 迁移六Agent UI组件 | 30分钟 | 🔴 P0 | 前端 |
| 6 | D1-006 | 迁移类型定义 | 20分钟 | 🔴 P0 | 前端 |
| 7 | D1-007 | 安装项目依赖 | 10分钟 | 🔴 P0 | 前端 |
| 8 | D1-008 | 首次构建验证 | 5分钟 | 🔴 P0 | 前端 |
| **总计** | - | - | **130分钟** | - | - |

---

## Week 1 里程碑 (Day 1-5)

| 日期 | 里程碑 | 验收标准 | 状态 |
|------|--------|----------|------|
| Day 1 | 项目初始化完成 | 项目可运行，UI组件正常显示 | ⏳ |
| Day 2 | 基础类型完成 | 所有类型定义完整 | ⏳ |
| Day 3 | API路由框架 | API路由结构完成 | ⏳ |
| Day 4 | 核心服务框架 | A2A/状态机/治理引擎框架 | ⏳ |
| Day 5 | Phase 0完成 | 所有验收标准通过 | ⏳ |

---

## 36天执行路线图

```
Week 1 (Day 1-5): Phase 0 - 骨架搭建
├── Day 1: 项目初始化 + 技术债务清算
├── Day 2: 类型定义 + 基础配置
├── Day 3: API路由框架
├── Day 4: 核心服务框架
└── Day 5: 集成验证 + 文档

Week 2 (Day 6-12): Phase 1 - 冷热分层
├── Day 6-7: TSA类型定义 + Transient存储
├── Day 8-9: Staging存储 + Archive存储
├── Day 10-11: 路由层实现
└── Day 12: 集成测试

Week 3 (Day 13-19): Phase 2 - TSA三层
├── Day 13-14: TSA初始化
├── Day 15-16: 智能路由
├── Day 17: 生命周期管理
└── Day 18-19: 监控面板 + 集成测试

Week 4 (Day 20-26): Phase 3 - Fabric装备化
├── Day 20-21: 装备类型定义 + 基础系统装备
├── Day 22-23: 七权人格装备
├── Day 24-25: 上下文装备 + 动作装备
└── Day 26: 装备注册中心 + 集成测试

Week 5 (Day 27-33): Phase 4 - Coze插件槽位
├── Day 27-28: 插件类型定义 + 槽位核心
├── Day 29: 注册中心
├── Day 30-31: 多模式适配器
├── Day 32: 安全层
└── Day 33: 集成测试

Week 6 (Day 34-36): Phase 5 - 集成测试
├── Day 34: 端到端测试
├── Day 35: 性能测试 + 质量门禁
└── Day 36: 验收测试 + 发布
```

---

## 关键检查点

### 每日检查点

| 检查点 | 时间 | 内容 |
|--------|------|------|
| 晨会 | 09:00 | 昨日进度 + 今日计划 |
| 代码审查 | 15:00 | 当日代码审查 |
| 日终总结 | 18:00 | 进度更新 + 问题反馈 |

### 每周检查点

| 检查点 | 时间 | 内容 |
|--------|------|------|
| 周计划 | 周一 09:00 | 本周详细计划 |
| 周中检查 | 周三 15:00 | 进度偏差检查 |
| 周总结 | 周五 18:00 | 本周成果 + 下周计划 |

### 里程碑检查点

| 里程碑 | 日期 | 验收标准 |
|--------|------|----------|
| Phase 0 | Day 5 | 项目可运行，UI组件正常显示 |
| Phase 1 | Day 12 | TSA三层存储功能完整 |
| Phase 2 | Day 19 | 智能路由 + 生命周期管理 |
| Phase 3 | Day 26 | 七权人格装备可用 |
| Phase 4 | Day 33 | Coze插件槽位功能完整 |
| Phase 5 | Day 36 | 验收通过，可发布 |

---

## 风险预警

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| UI组件迁移不兼容 | 中 | 高 | 预留2天缓冲时间 |
| IndexedDB浏览器兼容 | 低 | 中 | 准备降级方案 |
| 插件安全漏洞 | 低 | 高 | 严格安全审查 |
| 工期延误 | 中 | 高 | 每周进度检查，及时调整 |

---

## 联系信息

| 角色 | 职责 | 联系方式 |
|------|------|----------|
| 总架构师 | 技术决策 | B-09 |
| 前端负责人 | Phase 0-4 | Atoms团队 |
| DevOps | 部署 + 清算 | Atoms团队 |
| QA | 测试 | Atoms团队 |

---

## 附录

### A. 快速命令参考

```bash
# 项目初始化
cd /mnt/okcomputer/output
npx create-next-app@latest skills-v2.1 --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"

# 依赖安装
cd skills-v2.1
npm install zod uuid idb
npm install -D @types/uuid

# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npx tsc --noEmit

# 代码检查
npm run lint
```

### B. 目录结构速查

```
skills-v2.1/
├── app/                    # Next.js App Router
│   ├── (routes)/
│   ├── api/v1/{a2a,state,governance,coze}/
│   ├── components/ui/      # 六Agent UI
│   ├── hooks/
│   └── lib/
├── components/ui/          # shadcn/ui
├── config/                 # 配置文件
├── lib/                    # 核心库
│   ├── types/             # 类型定义
│   ├── tsa/               # TSA三层存储
│   ├── patterns/          # Fabric装备库
│   └── plugins/           # Coze插件槽位
└── tests/                 # 测试文件
```

### C. 验收标准速查

| Phase | 验收标准 |
|-------|----------|
| Phase 0 | 项目可运行，UI组件正常显示，构建成功 |
| Phase 1 | TSA三层存储功能完整，单元测试通过 |
| Phase 2 | 智能路由正确，生命周期管理正常 |
| Phase 3 | 七权人格装备可用，装备渲染正确 |
| Phase 4 | Coze插件槽位功能完整，安全层通过 |
| Phase 5 | 所有测试通过，质量门禁通过 |

---

> **立即执行**: Day 1任务共8项，预计130分钟完成。请Atoms团队立即开始执行。

> **总架构师确认**: 本执行清单已通过评审，可立即执行。
