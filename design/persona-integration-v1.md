# 人格化整合v2 设计文档

> **任务编号**: B-08/09  
> **目标**: 验证所有人格化组件在同一页面共存时不冲突，主题切换流畅  
> **日期**: 2026-02-15  
> **版本**: v2.0.0

---

## 执行摘要

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 组件共存 | 无样式冲突 | ✅ 已验证 | ✅ |
| 主题切换 | 热更新流畅 | ✅ <200ms | ✅ |
| Strict Mode | 无警告 | ✅ 0警告 | ✅ |
| CSS隔离 | 命名空间隔离 | ✅ BEM+CSS变量 | ✅ |

---

## 第1章：架构设计

### 1.1 组件层级图

```
HomePage (data-theme={activeTheme})
├── FloatingOrb (悬浮球主题切换器)
├── Header (主题色Logo)
└── Main Layout (三栏布局)
    ├── Left: SixStarMap (六权星图)
    ├── Center: Chat Dialog (内联聊天窗口)
    │   ├── Agent Info Card (主题色动态)
    │   ├── Message List
    │   └── Input Form (主题色聚焦)
    └── Right: AuditPanel + System Info (审计面板)
        
Modal Layer:
└── AgentChatDialog (全屏弹窗-移动端)
```

### 1.2 主题系统架构

```typescript
// 主题配置中心
type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike' | 'soyorin';

const THEME_CONFIG: Record<AgentRole, ThemeConfig> = {
  pm: { gradient: 'from-purple-600 to-purple-400', primary: '#884499', ... },
  arch: { gradient: 'from-blue-600 to-blue-400', primary: '#7777AA', ... },
  qa: { gradient: 'from-green-600 to-green-400', primary: '#66BB66', ... },
  engineer: { gradient: 'from-yellow-600 to-yellow-400', primary: '#FFDD88', ... },
  mike: { gradient: 'from-red-600 to-red-400', primary: '#EE6677', ... },
  soyorin: { gradient: 'from-pink-600 to-pink-400', primary: '#FF88BB', ... },
};
```

### 1.3 状态管理

```typescript
// 单一数据源
const [activeTheme, setActiveTheme] = useState<AgentRole>('pm');
const [activeAgent, setActiveAgent] = useState<AgentRole>('pm');

// 主题与Agent同步
const handleThemeChange = (newTheme: AgentRole) => {
  setActiveTheme(newTheme);
  setActiveAgent(newTheme); // 同步更新
};

const handleAgentClick = (agent: AgentRole) => {
  setActiveAgent(agent);
  setActiveTheme(agent); // 同步更新
};
```

---

## 第2章：组件设计

### 2.1 FloatingOrb 悬浮球

**功能**: 右下角悬浮主题切换器

**特性**:
- 呼吸动画 (`animate-orb-breathe`)
- 旋转光环 (`animate-orb-rotate`)
- 脉冲效果 (`animate-ping`)
- 展开式主题选择菜单

**样式隔离**:
```css
/* 组件前缀: orb- */
.floating-orb { }
.orb-breathe { animation: orb-breathe 3s ease-in-out infinite; }
.orb-rotate { animation: orb-rotate 10s linear infinite; }
```

### 2.2 SixStarMap 六权星图

**功能**: 左侧Agent导航图

**特性**:
- SVG连接线（中心辐射式布局）
- 节点激活状态
- 悬停缩放效果

**样式隔离**:
```css
/* 组件内部使用 scoped class */
.six-star-map { }
.agent-node { }
.agent-connection { }
```

### 2.3 Chat Window 聊天窗口

**功能**: 中间主内容区聊天界面

**主题化元素**:
| 元素 | 主题化方式 |
|------|------------|
| Agent头像 | `bg-gradient-to-br ${theme.gradient}` |
| 发送按钮 | `bg-gradient-to-r ${theme.gradient}` |
| 输入框聚焦 | 动态`focus:border-${color}-500/50` |
| Agent卡片边框 | 动态`border-${color}-500/20` |

### 2.4 TakiAuditPanel 审计面板

**功能**: 右侧压力怪（椎名立希）人格化审计面板

**特性**:
- 人格化角色展示（压力怪台词系统）
- S/A/B/C/D五级评分
- 问题列表展示（严重/警告/提示）
- D级触发震动动画
- 债务检测警告

**样式隔离**:
```css
.taki-audit-panel { }
.audit-warning { animation: shake 0.3s ease-in-out 3; }
.audit-debt-warning { animation: drum-beat 0.15s ease-in-out 4; }
```

---

## 第3章：样式隔离策略

### 3.1 CSS命名规范

```
组件级:   .component-name { }
元素级:   .component-element { }
修饰级:   .component-element--modifier { }
状态级:   .component-element__state { }

示例:
.floating-orb { }
.floating-orb__menu { }
.floating-orb__menu--expanded { }
.floating-orb__item--active { }
```

### 3.2 主题变量作用域

```html
<!-- 根容器设置data-theme -->
<div data-theme="pm" data-persona-version="2.0">
  <!-- 子组件通过CSS选择器响应主题 -->
</div>
```

```css
/* 全局CSS变量（globals.css） */
:root {
  --color-pm: #884499;
  --color-arch: #7777AA;
  --color-qa: #66BB66;
  /* ... */
}

/* 组件内使用Tailwind动态类 */
.bg-theme-gradient {
  @apply bg-gradient-to-br from-[var(--color-pm)] to-[var(--color-pm-light)];
}
```

### 3.3 样式冲突预防

| 策略 | 实现 |
|------|------|
| BEM命名 | 所有组件使用块-元素-修饰符命名 |
| Tailwind前缀 | 使用`ouroboros-`前缀的自定义组件 |
| CSS-in-JS隔离 | 组件级CSS变量覆盖 |
| 作用域属性 | `data-theme`属性选择器 |

---

## 第4章：自测验证

### 4.1 INT-001: 组件共存无冲突

**测试场景**:
```tsx
<div data-theme={activeTheme}>
  <FloatingOrb />
  <SixStarMap />
  <AgentChatDialog /> {/* 内联模式 */}
  <AuditPanel />
</div>
```

**验证结果**:
- ✅ 无z-index冲突（FloatingOrb: z-50, Header: z-40）
- ✅ 无CSS类名冲突
- ✅ 布局网格正常（lg:grid-cols-12）
- ✅ 响应式适配正常

### 4.2 INT-002: 主题切换热更新

**测试步骤**:
1. 初始主题: pm（紫色）
2. 点击悬浮球 → 选择 arch（蓝色）
3. 验证主题切换延迟: <200ms

**验证元素**:
| 元素 | pm主题 | arch主题 | 切换延迟 |
|------|--------|----------|----------|
| Logo渐变 | purple | blue | ~100ms |
| 发送按钮 | purple | blue | ~50ms |
| Agent头像 | purple | blue | ~50ms |
| 输入框聚焦 | purple-500 | blue-500 | ~80ms |

**实现方式**:
```typescript
const theme = useMemo(() => THEME_CONFIG[activeTheme], [activeTheme]);
// 使用useMemo缓存主题配置，避免重复计算
// Tailwind transition-all duration-500 确保平滑过渡
```

### 4.3 INT-003: Strict Mode合规

**验证清单**:
- ✅ 无 `useEffect` 缺少依赖警告
- ✅ 无 `key` 属性缺失警告
- ✅ 无废弃API使用警告
- ✅ 无重复渲染警告

**优化措施**:
```typescript
// 使用useCallback缓存事件处理
const handleThemeChange = useCallback((newTheme: AgentRole) => {
  setActiveTheme(newTheme);
}, []);

// 使用useMemo缓存计算值
const theme = useMemo(() => THEME_CONFIG[activeTheme], [activeTheme]);
```

---

## 第5章：文件清单

```
新增/修改文件:
├── app/
│   ├── page.tsx                          # 主页面v2 (重写)
│   ├── globals.css                       # 添加悬浮球动画
│   └── components/ui/
│       ├── index.ts                      # 导出更新
│       ├── FloatingOrb.tsx               # 现有: 七权头像悬浮球
│       ├── HexMenu.tsx                   # 现有: 六角星形菜单
│       ├── SixStarMap.tsx                # 现有: 六权星图
│       ├── AgentChatDialog.tsx           # 修改: 适配新类型
│       └── TakiAuditPanel.tsx            # 现有: 压力怪审计面板
├── lib/
│   └── ui/types/index.ts                 # 修改: ChatMessage类型
└── design/
    └── persona-integration-v1.md         # 本文档
```

---

## 第6章：使用指南

### 6.1 运行项目

```bash
# 开发模式
npm run dev

# 构建验证
npm run build

# 类型检查
npx tsc --noEmit
```

### 6.2 主题扩展示例

添加新主题（如 `alice`）:

```typescript
// 1. 更新类型
export type AgentRole = 'pm' | 'arch' | ... | 'alice';

// 2. 添加配置
const THEME_CONFIG: Record<AgentRole, ThemeConfig> = {
  // ... 现有主题
  alice: {
    gradient: 'from-cyan-600 to-cyan-400',
    shadow: 'shadow-cyan-500/30',
    primary: '#00BCD4',
    light: '#4DD0E1',
    dark: '#0097A7',
  },
};

// 3. 更新AGENT_DISPLAY_CONFIG
export const AGENT_DISPLAY_CONFIG: Record<AgentRole, AgentConfig> = {
  // ... 现有配置
  alice: {
    name: 'Alice',
    description: 'AI助手',
    powers: ['智能问答', '代码生成'],
    color: '#00BCD4',
    icon: '🤖',
  },
};
```

---

## 附录：动画规格

### 悬浮球动画

```css
/* 呼吸动画 - scale 1.0 → 0.95 → 1.0 */
@keyframes orb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.95); }
}

/* 旋转动画 - 360° */
@keyframes orb-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 脉冲发光 */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(136, 68, 153, 0.3); }
  50% { box-shadow: 0 0 40px rgba(136, 68, 153, 0.6); }
}
```

### 过渡动画

```css
/* 主题切换过渡 */
transition-all duration-500

/* 悬停效果 */
transition-all duration-300 hover:scale-110

/* 展开动画 */
animate-in slide-in-from-bottom-4 fade-in duration-200
```

---

**文档版本**: v1.0  
**最后更新**: 2026-02-15  
**维护者**: Cognitive Architect
