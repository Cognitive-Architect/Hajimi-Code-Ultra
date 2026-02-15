# FloatingOrb V1 设计文档

## B-04/09 悬浮球工程师 → 七权头像悬浮球基础

---

## 1. 概述

FloatingOrb 是 Ouroboros 系统的核心 UI 组件，提供右下角常驻悬浮球入口，支持七权主题切换与快捷操作。

---

## 2. 组件架构

```
FloatingOrb (悬浮球容器)
├── SoyorinAvatar (Q版头像SVG)
├── StateIndicator (状态指示点)
└── HexMenu (六角星形菜单) - 条件渲染
    ├── BackgroundOverlay (背景遮罩)
    ├── HexagonLines (六边形连接线 SVG)
    ├── AgentButtons[6] (六权按钮)
    └── CloseButton (关闭按钮)
```

---

## 3. 视觉规范

### 3.1 悬浮球 (48px)

| 属性 | 值 | 说明 |
|------|-----|------|
| 尺寸 | 48×48px | 固定尺寸 |
| 位置 | bottom: 24px, right: 24px | 右下角固定 |
| 圆角 | 50% (圆形) | 头像样式 |
| 背景 | 线性渐变 135° | #884499 → #AA66BB (默认主题) |
| 阴影 | 动态光晕 | 正常: 15px, 激活: 30px |
| Z-Index | 50 | 最高层级 |

### 3.2 呼吸动画 (Breathe)

```css
@keyframes orb-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.95); }
}
/* 3s ease-in-out infinite */
```

- 缩放范围: 0.95 → 1.0
- 周期: 3秒
- 缓动: ease-in-out

### 3.3 三色状态

| 状态 | 视觉表现 | 用途 |
|------|----------|------|
| **Idle (空闲)** | 绿色状态点 + 呼吸动画 | 正常运行 |
| **Rotating (旋转)** | 蓝色状态点 + 旋转动画 | 处理中 |
| **Warning (警告)** | 红色状态点 + 红色光晕脉冲 | 异常/错误 |

### 3.4 六角星形菜单

- 布局: 六边形放射状
- 半径: 80px
- 中心: 关闭按钮
- 六权分布: 顶部开始顺时针 (PM → Arch → QA → Engineer → Mike → Soyorin)

---

## 4. 交互规范

### 4.1 点击悬浮球

- **关闭 → 打开**: 展开 HexMenu，透明度变为 100%，阴影增强
- **打开 → 关闭**: 收起 HexMenu，恢复默认状态

### 4.2 选择 Agent

1. 点击六权中任意一个
2. 触发 onSelect 回调
3. 300ms 延迟后自动关闭菜单
4. 悬浮球主题色切换

### 4.3 点击遮罩

- 立即关闭菜单
- 恢复默认状态

---

## 5. 技术实现

### 5.1 文件结构

```
app/components/ui/
├── FloatingOrb.tsx    # 主悬浮球组件
└── HexMenu.tsx        # 六角星形菜单

app/globals.css        # 动画样式 (已添加)

design/
└── floating-orb-v1.md # 本文档
```

### 5.2 新增 CSS 动画

```css
.animate-orb-breathe   /* 呼吸动画 scale 0.95-1.0 */
.animate-orb-rotate    /* 旋转动画 */
.animate-orb-warning   /* 警告脉冲光晕 */
```

### 5.3 Props 接口

```typescript
interface FloatingOrbProps {
  initialTheme?: AgentTheme;     // 默认: 'mutsumi'
  onThemeChange?: (theme) => void;
}

interface HexMenuProps {
  activeAgent?: AgentRole;       // 当前选中
  onSelect?: (agent) => void;
  onClose?: () => void;
}
```

---

## 6. 自测清单

| 编号 | 测试项 | 状态 |
|------|--------|------|
| ORB-001 | 悬浮球右下角固定定位 | ✅ |
| ORB-002 | 呼吸动画 (scale 0.95-1.0) | ✅ |
| ORB-003 | 点击展开六角星形菜单 | ✅ |
| ORB-004 | 状态指示器显示 | ✅ |
| ORB-005 | 主题色切换 | ✅ |
| ORB-006 | 关闭按钮/遮罩关闭 | ✅ |

---

## 7. 主题色映射

| Agent | 主色 | 副色 | 阴影色 |
|-------|------|------|--------|
| Mutsumi/Soyorin | #884499 | #AA66BB | rgba(136, 68, 153, 0.6) |
| Mike | #7777AA | #9999CC | rgba(119, 119, 170, 0.6) |
| QA | #66BB66 | #88DD88 | rgba(102, 187, 102, 0.6) |
| Engineer | #FFDD88 | #FFEEAA | rgba(255, 221, 136, 0.6) |
| PM | #884499 | #AA66BB | rgba(136, 68, 153, 0.6) |
| Arch | #EE6677 | #FF88AA | rgba(238, 102, 119, 0.6) |

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-02-15 | 初始版本 - 基础悬浮球 + HexMenu |

---

## 9. 后续优化方向

1. **动画增强**: 菜单展开/收起的弹簧动画
2. **拖拽功能**: 悬浮球位置可拖拽调整
3. **未读提示**: 状态点显示未读消息数
4. **声音反馈**: 点击音效
5. **手势支持**: 长按、滑动快捷操作
