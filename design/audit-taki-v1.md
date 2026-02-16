# 压力怪（椎名立希）审计界面设计文档

**版本**: v1.0  
**创建日期**: 2026-02-15  
**对应任务**: B-02/09 压力怪界面工程师 → 审计界面人格化

---

## 1. 设计概述

### 1.1 人格化定位

**角色**: 椎名立希（Shiina Taki）  
**身份**: 审计界面工程师 / 鼓手  
**主题色**: 深蓝 `#7777AA`  

### 1.2 核心特征

| 维度 | 描述 |
|------|------|
| **视觉** | 锐利眼神、鼓手元素、深蓝配色 |
| **性格** | 严格、毒舌、对质量要求极高 |
| **认可方式** | 别扭地表达，从不直接夸奖 |
| **警告方式** | 鼓点震动、鼓棒敲击音效 |

---

## 2. 组件架构

### 2.1 文件结构

```
app/components/ui/AuditPanel.tsx    # 主组件
app/globals.css                     # 动画样式（鼓点震动）
design/audit-taki-v1.md            # 本文档
```

### 2.2 组件接口

```typescript
interface AuditPanelProps {
  result?: AuditResult;     // 审计结果
  isLoading?: boolean;      // 加载状态
  onReaudit?: () => void;   // 重新审计回调
  className?: string;       // 自定义类名
}

interface AuditResult {
  grade: 'S' | 'A' | 'B' | 'C' | 'D';  // 五级评级
  score: number;                        // 分数 (0-100)
  issues: AuditIssue[];                 // 问题列表
  debtCount: number;                    // 技术债务数量
  timestamp: Date;                      // 审计时间
}
```

---

## 3. 评级系统

### 3.1 五级评级

| 等级 | 颜色 | 日文台词 | 中文翻译 | 震动强度 |
|------|------|----------|----------|----------|
| **S** | `#FFD700` (金) | 認める | 认可 | 0 |
| **A** | `#7777AA` (蓝) | ...悪くない | ...还行吧 | 0 |
| **B** | `#6699CC` (浅蓝) | まあまあ | 还行 | 0 |
| **C** | `#888888` (灰) | ふつう | 普通 | 0 |
| **D** | `#CC4444` (红) | つまらない | 无聊 | 4px |

### 3.2 评级逻辑

```
S: 90-100分  → 认可（最高评价）
A: 80-89分   → ...还行吧（别扭认可）
B: 70-79分   → 还行（平淡）
C: 60-69分   → 普通（不屑）
D: <60分     → 无聊（触发震动警告）
```

---

## 4. 动画系统

### 4.1 鼓点震动动画

```css
@keyframes drum-beat {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.audit-warning {
  animation: drum-beat 0.3s ease-in-out 3;
  border-color: #7777AA;
}
```

### 4.2 快速鼓点（债务警告）

```css
@keyframes drum-beat-fast {
  0%, 100% { transform: translateX(0) scale(1); }
  25% { transform: translateX(-6px) scale(1.02); }
  50% { transform: translateX(0) scale(1); }
  75% { transform: translateX(6px) scale(1.02); }
}
```

### 4.3 动画触发条件

| 动画 | 触发条件 | 持续时间 |
|------|----------|----------|
| drum-beat | D级评级 | 0.9s (0.3s × 3) |
| drum-beat-fast | 发现债务时 | 0.6s (0.15s × 4) |
| breathe | 加载状态 | 无限循环 |

---

## 5. 视觉元素

### 5.1 头像设计

```
🥁 鼓手 emoji + 红色脉冲点（锐利眼神指示器）
背景: #7777AA
尺寸: 48x48px
圆角: 全圆
```

### 5.2 台词气泡

- 左右引号装饰: `#7777AA`
- 背景: `rgba(15, 23, 42, 0.5)`
- 边框: `1px solid rgba(119, 119, 170, 0.2)`
- 日文主文本 + 中文副文本

### 5.3 进度条

- 渐变填充: `linear-gradient(90deg, gradeColor, gradeColor88)`
- 底部刻度: D C B A S

---

## 6. 使用示例

### 6.1 基础用法

```tsx
import { AuditPanel } from '@/app/components/ui/AuditPanel';

<AuditPanel 
  result={{
    grade: 'A',
    score: 92,
    issues: [],
    debtCount: 0,
    timestamp: new Date()
  }}
/>
```

### 6.2 带重新审计

```tsx
<AuditPanel 
  result={auditResult}
  onReaudit={() => runAudit()}
  isLoading={isAuditing}
/>
```

### 6.3 D级警告演示

```tsx
<AuditPanel 
  result={{
    grade: 'D',
    score: 45,
    issues: [
      { id: '1', type: 'critical', message: '代码质量过低' }
    ],
    debtCount: 5,
    timestamp: new Date()
  }}
/>
// 触发: 震动动画 + "つまらない" + "哈？！5个债务"
```

---

## 7. 自测清单

### TAKI-001: D级显示
- [x] 显示"つまらない"日文台词
- [x] 显示"无聊"中文翻译
- [x] 触发drum-beat震动动画 (0.3s × 3)
- [x] 边框变为 #7777AA

### TAKI-002: A级显示
- [x] 显示"...悪くない"日文台词
- [x] 显示"...还行吧"中文翻译
- [x] 使用 #7777AA 配色
- [x] 无震动动画

### TAKI-003: 债务警告
- [x] 显示"哈？！{count}个债务"标签
- [x] 触发drum-beat-fast快速震动
- [x] 头像红色脉冲点闪烁
- [x] 边框变为 #CC4444

---

## 8. 扩展计划

### 8.1 未来增强

1. **音效系统**: 添加真实鼓点音效
2. **更多台词**: 根据问题类型显示不同台词
3. **历史记录**: 显示审计历史趋势
4. **对比模式**: 前后两次审计对比

### 8.2 无障碍支持

- 动画支持 `prefers-reduced-motion`
- 颜色对比度符合 WCAG 2.1 AA
- 屏幕阅读器友好

---

## 9. 参考

- 人设参考: BanG Dream! It's MyGO!!!!! 椎名立希
- 动画灵感: 鼓点节奏、鼓手演奏动作
- 配色参考: Ouroboros 七权人格化主题

---

**文档结束**
