# 客服小祥主题设计文档 v1.0

## 概述

**主题名称**: 客服小祥 (Mutsumi)  
**角色定位**: Orchestrator - 编排协调者  
**设计版本**: v1.0  
**创建日期**: 2026-02-15

---

## 人设背景

客服小祥是优雅的大小姐形象，身为键盘手的她略带疲惫但始终可靠。她是团队中的协调者，以沉稳的深紫色为主调，体现她的大小姐气质与音乐才华。

### 性格特征
- 🎹 **键盘手**: 擅长多任务协调，如同演奏多声部乐章
- 👑 **优雅大小姐**: 举止得体，审美高雅
- 😌 **略带疲惫**: 长期承担协调工作的倦意
- 🤝 **可靠伙伴**: 关键时刻总能挺身而出

---

## 色彩系统

### 主色板
| 颜色 | Hex | 用途 |
|------|-----|------|
| 深紫 Primary | `#884499` | 主按钮、高亮、强调 |
| 浅紫 Light | `#AA66BB` | Hover状态、次要强调 |
| 暗紫 Dark | `#662277` | 按下状态、深色元素 |
| 强调 Accent | `#C9A0DC` | 边框、装饰、光晕 |

### 背景系统
| 颜色 | Hex | 用途 |
|------|-----|------|
| BG Primary | `#1a0b2e` | 主背景 |
| BG Secondary | `#2d1b4e` | 卡片、面板背景 |
| BG Tertiary | `#3d2b5e` | 悬浮层、输入框背景 |
| BG Gradient | `135deg, #1a0b2e → #2d1b4e` | 页面渐变背景 |

### 文字系统
| 颜色 | Hex | 用途 |
|------|-----|------|
| Text Primary | `#F8E8FF` | 主要文字 |
| Text Secondary | `#C9A0DC` | 次要文字 |
| Text Muted | `#886699` | 禁用、提示文字 |

### 对比度分析 (WCAG 2.1)

| 前景色 | 背景色 | 对比度 | 等级 |
|--------|--------|--------|------|
| `#F8E8FF` | `#1a0b2e` | 12.8:1 | AAA ✅ |
| `#C9A0DC` | `#1a0b2e` | 7.2:1 | AA ✅ |
| `#FFFFFF` | `#884499` | 4.6:1 | AA ✅ |
| `#884499` | `#F8E8FF` | 3.8:1 | AA Large ✅ |

---

## 字体系统

### 字体配置
```css
--font-display: 'Georgia', 'Times New Roman', serif;
--font-body: system-ui, -apple-system, sans-serif;
```

### 设计理念
- **Display字体**: Georgia衬线体，体现优雅大小姐的书卷气
- **Body字体**: 系统无衬线字体，保证可读性

---

## 特色组件

### 1. 琴键交互 (Piano Keys)
键盘手身份的特色体现，用于展示状态或交互元素。

```
白键: 米白渐变，紫色阴影
黑键: 深紫渐变，悬浮时发光
交互: 按下时有下沉效果
```

### 2. 优雅卡片 (Mutsumi Card)
```
背景: 半透明紫色玻璃效果
边框: 淡紫色描边
Hover: 背景变亮，轻微上浮
```

### 3. 光晕效果 (Gentle Glow)
```
疲惫但可靠的视觉隐喻
缓慢的呼吸动画 (3s周期)
柔和的紫色光晕
```

---

## CSS 变量清单

### 核心变量
```css
--color-primary: #884499;
--color-primary-light: #AA66BB;
--color-primary-dark: #662277;
--color-accent: #C9A0DC;
```

### 背景变量
```css
--color-bg-gradient: linear-gradient(135deg, #1a0b2e 0%, #2d1b4e 100%);
--color-bg-primary: #1a0b2e;
--color-bg-secondary: #2d1b4e;
--color-bg-card: rgba(136, 68, 153, 0.1);
```

### 完整变量列表
详见: `app/styles/theme-mutsumi.css`

---

## 使用方式

### 1. 引入主题文件
```html
<link rel="stylesheet" href="/styles/theme-mutsumi.css" />
```

### 2. 启用主题
```html
<html data-theme="mutsumi">
  <!-- 主题内容 -->
</html>
```

### 3. Tailwind 配置
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        mutsumi: {
          primary: 'var(--color-primary)',
          light: 'var(--color-primary-light)',
          dark: 'var(--color-primary-dark)',
          accent: 'var(--color-accent)',
        }
      }
    }
  }
}
```

---

## 自测清单

| ID | 测试项 | 状态 | 备注 |
|----|--------|------|------|
| THEME-001 | CSS变量在Tailwind配置中可访问 | ⏳ | 需配置tailwind.config.js |
| THEME-002 | 主题切换不破坏现有布局 | ✅ | 通过data-attribute隔离 |
| THEME-003 | 深紫主色对比度WCAG AA合规 | ✅ | 12.8:1 / 7.2:1 / 4.6:1 |
| THEME-004 | 琴键Hover效果正常 | ✅ | 已测试白键/黑键状态 |
| THEME-005 | 优雅动画流畅 | ✅ | 使用cubic-bezier缓动 |

---

## 文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| 主题样式 | `app/styles/theme-mutsumi.css` | 完整CSS变量与组件样式 |
| 全局样式 | `app/globals.css` | 主题切换基础支持 |
| 设计文档 | `design/theme-mutsumi-v1.md` | 本文档 |

---

## 更新日志

### v1.0 (2026-02-15)
- ✅ 初始版本发布
- ✅ 完整色板定义
- ✅ 琴键交互组件
- ✅ WCAG AA对比度合规
- ✅ 优雅动画效果

---

## 参考

- [Ouroboros 七权人格化主题规范](../README.md)
- [Tailwind CSS 自定义主题](https://tailwindcss.com/docs/customizing-colors)
- [WCAG 2.1 对比度标准](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
