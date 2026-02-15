# 六权星图人格化涂装 v1.0

## 设计概述

将 SixStarMap 改造为可点击的"六权星图"，每个节点对应特定角色的人格化形象，包含专属配色、头像标识和交互反馈。

## 七权色板

| 角色 | 身份 | 色值 | 用途 |
|------|------|------|------|
| 客服小祥 | PM (产品经理) | `#884499` | 深紫色 - 立法与决策 |
| 黄瓜睦 | Architect (架构师) | `#669966` | 深绿色 - 系统架构 |
| 唐音 | Engineer (工程师) | `#FF9999` | 粉色 - 编码实现 |
| 咕咕嘎嘎 | QA (质保证) | `#77BBDD` | 水蓝色 - 质量守护 |
| 压力怪 | Audit (审计) | `#7777AA` | 深蓝色 - 审查监督 |
| Soyorin | PM-Soyorin (验收) | `#FFDD88` | 米金色 - 验收发布 |

## 角色人格化配置

```typescript
interface PersonaConfig {
  avatar: string;       // 头像标识（Emoji或汉字）
  glowColor: string;    // 发光颜色（带透明度）
  title: string;        // 角色称号
}
```

| 角色 | 头像 | 发光色 | 称号 |
|------|------|--------|------|
| pm | 祥 | `rgba(136, 68, 153, 0.6)` | 立法者 |
| arch | 🥒 | `rgba(102, 153, 102, 0.6)` | 架构师 |
| qa | 🦆 | `rgba(119, 187, 221, 0.6)` | 质守卫 |
| engineer | 🎀 | `rgba(255, 153, 153, 0.6)` | 编码使 |
| mike | ⚡ | `rgba(119, 119, 170, 0.6)` | 审计官 |
| soyorin | 素 | `rgba(255, 221, 136, 0.6)` | 验收者 |

## 六边形布局坐标

```
          [pm] 客服小祥 (50, 10)
                /    \
    [mike] 压力怪      [arch] 黄瓜睦
    (15, 35)            (85, 35)
          \    /    \    /
           [soyorin] Soyorin
              (50, 50)
          /    \    /    \
[engineer] 唐音      [qa] 咕咕嘎嘎
(30, 75)            (70, 75)
```

## 视觉特效

### 1. 发光高亮效果

```css
.star-node.active .star-avatar {
  box-shadow: 0 0 20px currentColor;
  animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
  0%, 100% { 
    box-shadow: 0 0 20px currentColor, 0 0 40px currentColor;
  }
  50% { 
    box-shadow: 0 0 30px currentColor, 0 0 60px currentColor;
  }
}
```

### 2. 交互反馈

- **悬停**：节点放大 1.1 倍
- **点击**：触发主题切换回调
- **激活**：双层发光脉冲动画 + 白色高亮边框

### 3. 连接线效果

- 外圈连线：静态 + 激活状态高亮
- 中心连线：虚线样式，表示从中心辐射

## 使用方式

```tsx
import { SixStarMap } from '@/app/components/ui/SixStarMap';
import type { AgentRole } from '@/lib/ui/types';

function MyComponent() {
  const [activeAgent, setActiveAgent] = useState<AgentRole>('pm');
  
  const handleAgentClick = (agent: AgentRole) => {
    setActiveAgent(agent);
    // 触发主题切换
    applyTheme(agent);
  };
  
  return (
    <SixStarMap 
      activeAgent={activeAgent}
      onAgentClick={handleAgentClick}
      className="w-80"
    />
  );
}
```

## 自测清单

- [x] **STAR-001**: 六节点对应六角色色
  - 每个节点使用正确的色值
  - 头像和标签颜色一致
  
- [x] **STAR-002**: 点击节点触发主题切换
  - onAgentClick 回调正确传递 AgentRole
  - 外部组件可接收并处理主题切换
  
- [x] **STAR-003**: 当前激活节点高亮发光
  - 激活节点显示脉冲发光动画
  - 双层阴影效果（20px + 40px）

## 文件清单

| 文件 | 说明 |
|------|------|
| `app/components/ui/SixStarMap.tsx` | 星图组件 v2.0 |
| `design/starmap-persona-v1.md` | 本设计文档 |

## 版本历史

- **v2.0** (2026-02-15): 人格化涂装，添加角色色、头像、发光效果
- **v1.0** (基础版): 基础六边形布局
