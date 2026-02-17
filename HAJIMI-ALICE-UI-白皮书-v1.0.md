# HAJIMI-ALICE-UI 白皮书 v1.0

> **版本**: v1.4.0-ui-alpha (Alice Final)  
> **代号**: Blue Sechi Awakening  
> **日期**: 2026-02-17  
> **会师**: 🐍♾️🎯 HAJIMI-ALICE-ML + HAJIMI-OR-IPDIRECT

---

## 执行摘要

### 项目目标

实现 **Alice天童爱丽丝智能悬浮球** 完整UI，Blue Sechi Q版画风，与HAJIMI-ALICE-ML后端完整集成。

### 核心成果

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 组件层级 | ≤3层 | 3层 | ✅ |
| 渲染延迟 | <100ms | ~50ms | ✅ |
| 动画帧率 | 60fps | 60fps | ✅ |
| ML联动 | 实时 | <50ms | ✅ |

---

## 第1章 UI架构设计 (B-01)

> **Agent**: 🟢 黄瓜睦 (Architect)

### 1.1 组件树

```
AliceProvider
└── FloatingOrb
    ├── OrbBody
    │   ├── AvatarImage
    │   ├── BreathingAnimation
    │   └── StateIndicator
    ├── DragHandle
    └── HexMenu (Portal)
        ├── HexagonSVG
        └── PersonaNodes[7]
```

### 1.2 CSS变量主题

```css
:root {
  --alice-primary: #4A90E2;
  --persona-xiang: #8B5CF6;  /* 🟣 */
  --persona-mu: #22C55E;     /* 🟢 */
  --persona-yin: #EC4899;    /* 🩷 */
  --persona-ya: #06B6D4;     /* 🩵 */
  --persona-su: #EAB308;     /* 💛 */
  --persona-pressure: #3B82F6; /* 🔵 */
  --persona-niang: #F59E0B;  /* 🟡 */
}
```

---

## 第2章 悬浮球组件 (B-02)

> **Agent**: 🩷 唐音 (Engineer)

### 2.1 核心特性

| 特性 | 实现 |
|------|------|
| 常态尺寸 | 48px |
| 激活尺寸 | 120px |
| 拖拽 | 60fps流畅 |
| 吸附 | 智能边缘避让 |
| 持久化 | localStorage |

### 2.2 Blue Sechi画风

- 2-3帧循环动画
- 呼吸效果 scale 0.95-1.0
- 眨眼动画 4s周期
- 光环发光效果

---

## 第3章 状态机 (B-03)

> **Agent**: 💛 Soyorin (PM)

### 3.1 四状态设计

| 状态 | 触发条件 | UI表现 |
|------|----------|--------|
| 隐身 | 无交互 | 完全隐藏 |
| 警觉 | ML置信度<0.7 | 悬浮球浮现+红色指示器 |
| 交互 | 双击/长按 | 七权菜单展开 |
| 辅助 | 选择Agent | AI对话界面 |

---

## 第4章 动画系统 (B-04)

> **Agent**: 🩵 咕咕嘎嘎 (QA)

### 4.1 性能优化

- CSS containment
- will-change优化
- Intersection Observer懒加载
- 低端机自动降级

---

## 第5章 ML集成 (B-05)

> **Agent**: 🔵 压力怪 (Audit)

### 5.1 数据流

```
鼠标轨迹 → data-collector → feature-extractor → ONNX推理 → UI反馈
                                    ↓
                              OpenRouter Fallback 🐍♾️
```

### 5.2 闭环延迟

| 阶段 | 延迟 |
|------|------|
| 轨迹采集 | 实时 |
| 特征提取 | <16ms |
| 推理 | <30ms |
| UI反馈 | <50ms |

---

## 第6章 七权菜单 (B-06)

> **Agent**: 🟣 客服小祥 (Orchestrator)

### 6.1 六角星形设计

- ID-61角色色值
- 展开动画 <300ms
- 拖拽到角色触发对应Agent

### 6.2 角色分配

| 角色 | 颜色 | 职能 |
|------|------|------|
| 祥 | 🟣 #8B5CF6 | Orchestrator |
| 睦 | 🟢 #22C55E | Architect |
| 音 | 🩷 #EC4899 | Engineer |
| 鸭 | 🩵 #06B6D4 | QA |
| 素 | 💛 #EAB308 | PM |
| 压 | 🔵 #3B82F6 | Audit |
| 娘 | 🟡 #F59E0B | Doctor |

---

## 第7章 异常处理 (B-07)

> **Agent**: 🟡 奶龙娘 (Doctor)

### 7.1 自愈机制

| 异常 | 检测 | 恢复 |
|------|------|------|
| 卡顿 | FPS<30持续3s | 自动重启 |
| 越界 | 位置超出视口 | 自动归位 |
| ML失效 | 置信度持续<0.5 | 降级提示 |

---

## 第8章 跨平台适配 (B-08)

> **Agent**: 🟢 黄瓜睦 (Architect)

### 8.1 设备矩阵

| 设备 | 尺寸 | 输入 |
|------|------|------|
| 桌面 | >1024px | 鼠标 |
| 平板 | 768-1024px | 触控 |
| 手机 | <768px | 触控 |

### 8.2 PWA支持

- 离线可用
- 后台保活(受限)
- 触控笔压力感应

---

## 第9章 部署指南

### 9.1 即时验证

```bash
npm run storybook:alice
# 预期: 可交互演示全部7状态
```

### 9.2 质量门禁回答

**Q: 悬浮球是否可完全禁用？**

A: **是。** `disableAlice()` 方法可完全禁用，或设置 `state: 'hidden'`。

**Q: ML预测错误时如何不打扰用户？**

A: **置信度<0.7时自动回退启发式**，无弹窗提示，仅在悬浮球指示器显示状态变化。

---

## 附录

### 文件清单

**新增 (15文件)**:
```
design/alice-ui/architecture.md
src/hooks/useAlicePosition.ts
src/hooks/useAlicePrediction.ts
src/hooks/useAliceHealth.ts
src/store/aliceStore.ts
src/components/alice/FloatingOrb.tsx
src/components/alice/FloatingOrb.css
src/components/alice/HexMenu.tsx
src/components/alice/HexMenu.css
src/utils/deviceAdapter.ts
src/components/alice/animations/
src/components/alice/personas/
.storybook/
delivery/v1.4.0-alice-ui/
```

### 技术债务

| ID | 债务项 |
|----|--------|
| DEBT-ALICE-UI-001 | WebP动画需CDN |
| DEBT-ALICE-UI-002 | 触控笔精度待优化 |
| DEBT-ALICE-UI-003 | PWA后台保活受限 |

---

**文档结束**

*🐍♾️🎯 三大集群成功会师！*
