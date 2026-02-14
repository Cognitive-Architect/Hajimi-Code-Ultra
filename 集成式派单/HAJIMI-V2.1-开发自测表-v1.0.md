# HAJIMI-SKILLS V2.1 开发自测表
> 版本: v1.0 | 日期: 2026-02-13

---

## 使用说明

1. 每个自测项都有唯一的ID，格式为 `RSCH-{Phase}-{序号}`
2. 自测结果使用以下标记：
   - ✅ 通过
   - ❌ 失败
   - ⏳ 待测试
   - 🚫 不适用
3. 每个Phase完成后，需由开发者签字确认

---

## Phase 0 骨架搭建 (5天)

### RSCH-0xx: 项目初始化

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-001 | Next.js 15 项目创建 | `npx create-next-app@latest` | 项目创建成功 | | ⏳ |
| RSCH-002 | TypeScript严格模式 | 检查 `tsconfig.json` | `strict: true` | | ⏳ |
| RSCH-003 | 项目可运行 | `npm run dev` | 无错误启动 | | ⏳ |
| RSCH-004 | 构建成功 | `npm run build` | 无错误构建 | | ⏳ |

### RSCH-0xx: 目录结构

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-005 | app/目录存在 | `ls app/` | 目录存在 | | ⏳ |
| RSCH-006 | lib/目录存在 | `ls lib/` | 目录存在 | | ⏳ |
| RSCH-007 | config/目录存在 | `ls config/` | 目录存在 | | ⏳ |
| RSCH-008 | 目录结构符合设计 | 对比设计文档 | 结构一致 | | ⏳ |

### RSCH-0xx: UI组件迁移

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-009 | AgentChatDialog迁移 | `ls app/components/ui/` | 文件存在 | | ⏳ |
| RSCH-010 | A2AMessageFeed迁移 | `ls app/components/ui/` | 文件存在 | | ⏳ |
| RSCH-011 | ProposalPanel迁移 | `ls app/components/ui/` | 文件存在 | | ⏳ |
| RSCH-012 | StateIndicator迁移 | `ls app/components/ui/` | 文件存在 | | ⏳ |
| RSCH-013 | DemoController迁移 | `ls app/components/ui/` | 文件存在 | | ⏳ |
| RSCH-014 | DemoPanel迁移 | `ls app/components/ui/` | 文件存在 | | ⏳ |
| RSCH-015 | UI组件可渲染 | 浏览器访问页面 | 组件正常显示 | | ⏳ |

### RSCH-0xx: 类型定义

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-016 | A2A类型定义 | `cat lib/types/a2a.ts` | 类型完整 | | ⏳ |
| RSCH-017 | 状态机类型定义 | `cat lib/types/state.ts` | 类型完整 | | ⏳ |
| RSCH-018 | Agent类型定义 | `cat lib/types/agent.ts` | 类型完整 | | ⏳ |
| RSCH-019 | 类型无错误 | `npx tsc --noEmit` | 无类型错误 | | ⏳ |

**Phase 0 签字**: _________________ 日期: _______

---

## Phase 1 冷热分层 (7天)

### RSCH-1xx: TSA类型定义

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-101 | StorageTier枚举 | `cat lib/tsa/types.ts` | 包含TRANSIENT/STAGING/ARCHIVE | | ⏳ |
| RSCH-102 | StorageItem接口 | `cat lib/tsa/types.ts` | 字段完整 | | ⏳ |
| RSCH-103 | RoutingDecision接口 | `cat lib/tsa/types.ts` | 字段完整 | | ⏳ |
| RSCH-104 | AccessMetrics接口 | `cat lib/tsa/types.ts` | 字段完整 | | ⏳ |

### RSCH-1xx: Transient存储 (热层)

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-105 | TransientStore类 | `cat lib/tsa/transient-store.ts` | 类存在 | | ⏳ |
| RSCH-106 | get方法 | 单元测试 | 返回正确值 | | ⏳ |
| RSCH-107 | set方法 | 单元测试 | 存储成功 | | ⏳ |
| RSCH-108 | TTL过期 | 单元测试 | 过期数据自动删除 | | ⏳ |
| RSCH-109 | LRU淘汰 | 单元测试 | 超出容量时淘汰最旧 | | ⏳ |
| RSCH-110 | 访问统计 | 单元测试 | readCount正确更新 | | ⏳ |

### RSCH-1xx: Staging存储 (温层)

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-111 | StagingStore类 | `cat lib/tsa/staging-store.ts` | 类存在 | | ⏳ |
| RSCH-112 | IndexedDB初始化 | 单元测试 | 数据库创建成功 | | ⏳ |
| RSCH-113 | get方法 | 单元测试 | 返回正确值 | | ⏳ |
| RSCH-114 | set方法 | 单元测试 | 存储成功 | | ⏳ |
| RSCH-115 | TTL过期 | 单元测试 | 过期数据自动删除 | | ⏳ |

### RSCH-1xx: 路由层

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-116 | TSARouter类 | `cat lib/tsa/router.ts` | 类存在 | | ⏳ |
| RSCH-117 | 路由决策 | 单元测试 | 返回正确目标层 | | ⏳ |
| RSCH-118 | 频率计算 | 单元测试 | 频率计算正确 | | ⏳ |
| RSCH-119 | 阈值配置 | 检查代码 | 阈值可配置 | | ⏳ |

**Phase 1 签字**: _________________ 日期: _______

---

## Phase 2 TSA三层 (7天)

### RSCH-2xx: TSA初始化

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-201 | TSA类 | `cat lib/tsa/index.ts` | 类存在 | | ⏳ |
| RSCH-202 | init方法 | 单元测试 | 初始化成功 | | ⏳ |
| RSCH-203 | 重复初始化 | 单元测试 | 不报错 | | ⏳ |
| RSCH-204 | 未初始化访问 | 单元测试 | 抛出错误 | | ⏳ |

### RSCH-2xx: 智能路由

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-205 | SmartRouter类 | `cat lib/tsa/smart-router.ts` | 类存在 | | ⏳ |
| RSCH-206 | 综合评分 | 单元测试 | 评分计算正确 | | ⏳ |
| RSCH-207 | 频率权重 | 单元测试 | 频率占50%权重 | | ⏳ |
| RSCH-208 | 时效权重 | 单元测试 | 时效占30%权重 | | ⏳ |
| RSCH-209 | 大小权重 | 单元测试 | 大小占20%权重 | | ⏳ |

### RSCH-2xx: 生命周期管理

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-210 | LifecycleManager类 | `cat lib/tsa/lifecycle.ts` | 类存在 | | ⏳ |
| RSCH-211 | 定期清理 | 单元测试 | 定时执行清理 | | ⏳ |
| RSCH-212 | 数据迁移 | 单元测试 | 自动迁移数据 | | ⏳ |
| RSCH-213 | start/stop | 单元测试 | 可启动和停止 | | ⏳ |

### RSCH-2xx: 监控面板

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-214 | TSAMonitor类 | `cat lib/tsa/monitor.ts` | 类存在 | | ⏳ |
| RSCH-215 | 命中率统计 | 单元测试 | 命中率计算正确 | | ⏳ |
| RSCH-216 | 层大小统计 | 单元测试 | 大小统计正确 | | ⏳ |
| RSCH-217 | getMetrics | 单元测试 | 返回完整指标 | | ⏳ |

### RSCH-2xx: 数据晋升

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-218 | 冷→温晋升 | 集成测试 | 访问冷数据后晋升到温层 | | ⏳ |
| RSCH-219 | 温→热晋升 | 集成测试 | 访问温数据后晋升到热层 | | ⏳ |
| RSCH-220 | 晋升后命中 | 集成测试 | 晋升后从热层读取 | | ⏳ |

**Phase 2 签字**: _________________ 日期: _______

---

## Phase 3 Fabric装备化 (7天)

### RSCH-3xx: 装备类型定义

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-301 | PatternType枚举 | `cat patterns/types.ts` | 包含SYSTEM/CONTEXT/ACTION | | ⏳ |
| RSCH-302 | Pattern接口 | `cat patterns/types.ts` | 字段完整 | | ⏳ |
| RSCH-303 | VariableDef接口 | `cat patterns/types.ts` | 字段完整 | | ⏳ |
| RSCH-304 | PatternConfig接口 | `cat patterns/types.ts` | 字段完整 | | ⏳ |
| RSCH-305 | RenderedPattern接口 | `cat patterns/types.ts` | 字段完整 | | ⏳ |

### RSCH-3xx: 基础系统装备

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-306 | baseSystemPattern | `cat patterns/system/base-system.ts` | 模板存在 | | ⏳ |
| RSCH-307 | createRolePattern | 单元测试 | 创建成功 | | ⏳ |
| RSCH-308 | Token限制 | 单元测试 | 配置正确 | | ⏳ |
| RSCH-309 | 压缩比率 | 单元测试 | 配置正确 | | ⏳ |

### RSCH-3xx: 七权人格装备

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-310 | 客服小祥装备 | `cat patterns/system/roles/客服小祥.pattern.ts` | 文件存在 | | ⏳ |
| RSCH-311 | 黄瓜睦装备 | `cat patterns/system/roles/黄瓜睦.pattern.ts` | 文件存在 | | ⏳ |
| RSCH-312 | 唐音装备 | `cat patterns/system/roles/唐音.pattern.ts` | 文件存在 | | ⏳ |
| RSCH-313 | 咕咕嘎嘎装备 | `cat patterns/system/roles/咕咕嘎嘎.pattern.ts` | 文件存在 | | ⏳ |
| RSCH-314 | Soyorin装备 | `cat patterns/system/roles/Soyorin.pattern.ts` | 文件存在 | | ⏳ |
| RSCH-315 | 压力怪装备 | `cat patterns/system/roles/压力怪.pattern.ts` | 文件存在 | | ⏳ |
| RSCH-316 | 奶龙娘装备 | `cat patterns/system/roles/奶龙娘.pattern.ts` | 文件存在 | | ⏳ |

### RSCH-3xx: 装备注册中心

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-317 | PatternRegistry类 | `cat patterns/registry.ts` | 类存在 | | ⏳ |
| RSCH-318 | register方法 | 单元测试 | 注册成功 | | ⏳ |
| RSCH-319 | get方法 | 单元测试 | 获取成功 | | ⏳ |
| RSCH-320 | getByType方法 | 单元测试 | 按类型获取成功 | | ⏳ |
| RSCH-321 | getStats方法 | 单元测试 | 统计正确 | | ⏳ |

### RSCH-3xx: 装备渲染

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-322 | 变量插值 | 单元测试 | 变量正确替换 | | ⏳ |
| RSCH-323 | Token计算 | 单元测试 | Token数正确 | | ⏳ |
| RSCH-324 | 依赖加载 | 单元测试 | 依赖装备正确加载 | | ⏳ |

**Phase 3 签字**: _________________ 日期: _______

---

## Phase 4 Coze插件槽位 (7天)

### RSCH-4xx: 插件类型定义

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-401 | PluginMode类型 | `cat lib/plugins/types.ts` | 包含http/iframe/mcp | | ⏳ |
| RSCH-402 | PluginStatus类型 | `cat lib/plugins/types.ts` | 状态完整 | | ⏳ |
| RSCH-403 | PluginManifestSchema | `cat lib/plugins/types.ts` | Zod Schema完整 | | ⏳ |
| RSCH-404 | PluginInstance接口 | `cat lib/plugins/types.ts` | 字段完整 | | ⏳ |
| RSCH-405 | PluginAdapter接口 | `cat lib/plugins/types.ts` | 方法完整 | | ⏳ |

### RSCH-4xx: 槽位核心

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-406 | PluginSlot类 | `cat lib/plugins/slot.ts` | 类存在 | | ⏳ |
| RSCH-407 | load方法 | 单元测试 | 加载成功 | | ⏳ |
| RSCH-408 | execute方法 | 单元测试 | 执行成功 | | ⏳ |
| RSCH-409 | unload方法 | 单元测试 | 卸载成功 | | ⏳ |
| RSCH-410 | 状态管理 | 单元测试 | 状态正确流转 | | ⏳ |

### RSCH-4xx: 注册中心

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-411 | PluginRegistry类 | `cat lib/plugins/registry.ts` | 类存在 | | ⏳ |
| RSCH-412 | registerManifest | 单元测试 | 注册成功 | | ⏳ |
| RSCH-413 | createSlot | 单元测试 | 创建成功 | | ⏳ |
| RSCH-414 | getStats | 单元测试 | 统计正确 | | ⏳ |

### RSCH-4xx: HTTP适配器

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-415 | HttpAdapter类 | `cat lib/plugins/adapters/http-adapter.ts` | 类存在 | | ⏳ |
| RSCH-416 | initialize | 单元测试 | 健康检查通过 | | ⏳ |
| RSCH-417 | execute | 单元测试 | HTTP请求成功 | | ⏳ |
| RSCH-418 | destroy | 单元测试 | 清理成功 | | ⏳ |

### RSCH-4xx: iframe适配器

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-419 | IframeAdapter类 | `cat lib/plugins/adapters/iframe-adapter.ts` | 类存在 | | ⏳ |
| RSCH-420 | initialize | 单元测试 | iframe加载成功 | | ⏳ |
| RSCH-421 | execute | 单元测试 | postMessage成功 | | ⏳ |
| RSCH-422 | destroy | 单元测试 | iframe移除成功 | | ⏳ |

### RSCH-4xx: 安全层

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-423 | PluginSecurity类 | `cat lib/plugins/security.ts` | 类存在 | | ⏳ |
| RSCH-424 | validateManifest | 单元测试 | 验证正确 | | ⏳ |
| RSCH-425 | checkPermission | 单元测试 | 权限检查正确 | | ⏳ |
| RSCH-426 | ID格式验证 | 单元测试 | 非法ID被拒绝 | | ⏳ |
| RSCH-427 | 版本格式验证 | 单元测试 | 非法版本被拒绝 | | ⏳ |

**Phase 4 签字**: _________________ 日期: _______

---

## Phase 5 集成测试 (3天)

### RSCH-5xx: 端到端测试

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-501 | A2A消息流 | E2E测试 | 消息发送接收正常 | | ⏳ |
| RSCH-502 | 状态机流转 | E2E测试 | 状态流转正常 | | ⏳ |
| RSCH-503 | 治理提案 | E2E测试 | 提案提交投票正常 | | ⏳ |
| RSCH-504 | TSA存储 | E2E测试 | 三层存储正常 | | ⏳ |
| RSCH-505 | Fabric装备 | E2E测试 | 装备渲染正常 | | ⏳ |
| RSCH-506 | Coze插件 | E2E测试 | 插件加载执行正常 | | ⏳ |

### RSCH-5xx: 性能测试

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-507 | TSA响应时间 | 性能测试 | 热层<1ms | | ⏳ |
| RSCH-508 | TSA命中率 | 性能测试 | 命中率>80% | | ⏳ |
| RSCH-509 | 页面加载时间 | Lighthouse | <3秒 | | ⏳ |
| RSCH-510 | 内存占用 | Chrome DevTools | 无内存泄漏 | | ⏳ |

### RSCH-5xx: 质量门禁

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-511 | 单元测试覆盖率 | `npm run test:coverage` | ≥80% | | ⏳ |
| RSCH-512 | 集成测试通过率 | `npm run test:integration` | 100% | | ⏳ |
| RSCH-513 | E2E测试通过率 | `npm run test:e2e` | 100% | | ⏳ |
| RSCH-514 | TypeScript严格模式 | `npx tsc --noEmit` | 0错误 | | ⏳ |
| RSCH-515 | ESLint | `npm run lint` | 0警告 | | ⏳ |
| RSCH-516 | 构建成功 | `npm run build` | 无错误 | | ⏳ |

### RSCH-5xx: 验收标准

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-517 | 36天工期 | 项目计划 | 按时完成 | | ⏳ |
| RSCH-518 | 53%复用率 | 代码统计 | 复用率≥53% | | ⏳ |
| RSCH-519 | 零数据丢失 | 数据验证 | 无数据丢失 | | ⏳ |
| RSCH-520 | Token优化75% | 对比测试 | Token减少75% | | ⏳ |

**Phase 5 签字**: _________________ 日期: _______

---

## 关键裁决自测

### RSCH-6xx: 工期验证

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-601 | 36天工期可行性 | 关键路径分析 | 可行 | | ⏳ |
| RSCH-602 | 各Phase工期 | 计划对比 | 符合计划 | | ⏳ |
| RSCH-603 | 里程碑达成 | 里程碑检查 | 按时达成 | | ⏳ |

### RSCH-6xx: 复用率验证

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-604 | UI组件复用 | 代码统计 | 复用率达标 | | ⏳ |
| RSCH-605 | 类型定义复用 | 代码统计 | 复用率达标 | | ⏳ |
| RSCH-606 | 总复用率 | 代码统计 | ≥53% | | ⏳ |

### RSCH-6xx: 技术债务

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-607 | 纯内存存储删除 | 代码检查 | 已删除 | | ⏳ |
| RSCH-608 | 硬编码提示词删除 | 代码检查 | 已删除 | | ⏳ |
| RSCH-609 | 紧耦合模块删除 | 代码检查 | 已删除 | | ⏳ |
| RSCH-610 | 新架构债务风险 | 架构评审 | 低风险 | | ⏳ |

### RSCH-6xx: Phase 5启动准备

| ID | 自测项 | 测试方法 | 预期结果 | 实际结果 | 状态 |
|----|--------|----------|----------|----------|------|
| RSCH-611 | Phase 0完成 | 产出检查 | 已完成 | | ⏳ |
| RSCH-612 | Phase 1完成 | 产出检查 | 已完成 | | ⏳ |
| RSCH-613 | Phase 2完成 | 产出检查 | 已完成 | | ⏳ |
| RSCH-614 | Phase 3完成 | 产出检查 | 已完成 | | ⏳ |
| RSCH-615 | Phase 4完成 | 产出检查 | 已完成 | | ⏳ |
| RSCH-616 | Phase 5可启动 | 依赖检查 | 可启动 | | ⏳ |

**总架构师签字**: _________________ 日期: _______

---

## 自测统计

| 类别 | 总数 | 通过 | 失败 | 待测试 | 通过率 |
|------|------|------|------|--------|--------|
| Phase 0 | 19 | 0 | 0 | 19 | 0% |
| Phase 1 | 19 | 0 | 0 | 19 | 0% |
| Phase 2 | 20 | 0 | 0 | 20 | 0% |
| Phase 3 | 24 | 0 | 0 | 24 | 0% |
| Phase 4 | 27 | 0 | 0 | 27 | 0% |
| Phase 5 | 20 | 0 | 0 | 20 | 0% |
| 关键裁决 | 16 | 0 | 0 | 16 | 0% |
| **总计** | **145** | **0** | **0** | **145** | **0%** |

---

> **使用说明**: 本自测表共145项，覆盖所有Phase和关键裁决点。每个Phase完成后，需由开发者签字确认。全部通过后，方可进入下一阶段。
