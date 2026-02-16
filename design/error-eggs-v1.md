# 错误码人格化彩蛋系统 v1.0

> **任务编号**: B-03/09  
> **任务名称**: 彩蛋工程师 → 错误码人格化彩蛋系统  
> **主题**: MyGO!!!!! 角色台词与梗映射

---

## 1. 系统概述

将枯燥的HTTP错误码转化为充满个性的MyGO!!!!!角色台词展示，让每个错误页面都成为粉丝的彩蛋体验。

### 1.1 设计目标

- **情感化**: 用角色台词缓解错误带来的挫败感
- **梗文化**: 精准使用MyGO!!!!!经典台词与梗
- **可扩展**: 支持添加更多角色和错误码
- **技术合规**: 完全兼容Next.js错误边界机制

---

## 2. 错误码映射表

### 2.1 客户端错误 (4xx)

| 错误码 | 角色 | 标题 | 梗来源 |
|--------|------|------|--------|
| **400** | Anon | "诶？这不对吧？" | 爱音的经典口癖 |
| **401** | Saki | "你这个人，满脑子只想着自己呢" | 祥子名台词 |
| **403** | Saki | "这是必要的代价" | Ave Mujica台词 |
| **404** | Soyorin | "なんで春日影やったの！？" | 春日影破防名场面 |
| **405** | Taki | "方法不对" | 压力怪风格 |
| **408** | Tomori | "时间...被遗忘了" | 灯的诗意表达 |
| **409** | Soyorin | "冲突...就像我们的关系" | 素世的复杂关系 |
| **410** | Saki | "已经...不存在了" | CRYCHIC解散 |
| **418** | Kaname | "我是茶壶...喵" | 418彩蛋+猫娘 |
| **422** | Anon | "无法处理呢～" | 爱音乐观风格 |
| **429** | Taki | "太慢了！" | 立希急躁性格 |

### 2.2 服务端错误 (5xx)

| 错误码 | 角色 | 标题 | 梗来源 |
|--------|------|------|--------|
| **500** | Taki | "つまらない" | 立希经典台词 |
| **501** | Taki | "还没实现" | 压力怪风格 |
| **502** | Soyorin | "是祥子的错吗？" | 素世对祥子的执念 |
| **503** | Kaname | "机油...需要休息..." | 奶龙娘机油梗 |
| **504** | Tomori | "等待...永恒地等待" | 灯的文学风格 |
| **507** | Anon | "空间不够了～" | 爱音的 cosmetic 梗 |

---

## 3. 角色设定

### 3.1 角色配色

```
Soyorin  (#884499) - 紫色系 - 客服小祥
Taki     (#7777AA) - 靛青系 - 压力怪
Saki     (#6699DD) - 蓝色系 - 背负人生
Kaname   (#FFDD00) - 黄色系 - 机油猫娘
Tomori   (#77AABB) - 青色系 - 诗人
Anon     (#FF6699) - 粉色系 - 爱音酱
```

### 3.2 角色性格映射

| 角色 | 性格特征 | 语言风格 |
|------|----------|----------|
| Soyorin | 执着、复杂 | 暗示性、带情感包袱 |
| Taki | 急躁、认真 | 直接、略带批评 |
| Saki | 冷静、决绝 | 冷漠、有距离感 |
| Kaname | 随性、古怪 | 简短、带猫语 |
| Tomori | 内向、诗意 | 抽象、文学化 |
| Anon | 乐观、活泼 | 轻松、带口癖 |

---

## 4. 组件架构

### 4.1 文件结构

```
app/
├── lib/
│   └── error-persona.ts      # 错误码映射配置
├── components/
│   └── ui/
│       └── ErrorPersona.tsx  # 展示组件
├── error.tsx                  # 全局错误边界
└── globals.css               # 动画样式
```

### 4.2 数据流

```
错误发生
   ↓
Next.js Error Boundary 捕获
   ↓
app/error.tsx 处理
   ↓
extractStatusCode() 提取状态码
   ↓
getErrorPersona() 获取角色配置
   ↓
ErrorPersona 组件渲染
   ↓
角色主题UI展示
```

---

## 5. 视觉效果

### 5.1 动画效果

| 角色 | 粒子效果 | 动画风格 |
|------|----------|----------|
| Soyorin | 🌸 樱花 | gentle-float |
| Taki | ⚡ 闪电 | sharp-pulse |
| Saki | ❄️ 雪花 | slow-fall |
| Kaname | 🐱 猫咪 | bounce |
| Tomori | 📝 诗笺 | drift |
| Anon | ✨ 闪光 | sparkle |

### 5.2 UI元素

- **状态码大数字**: 带发光效果的角色色
- **角色图标区**: 圆角卡片+边框发光
- **台词气泡**: 聊天气泡样式，带小三角
- **操作按钮**: 重试+返回首页
- **背景渐变**: 角色色系渐变

---

## 6. 使用方式

### 6.1 自动触发

Next.js 会自动使用 `app/error.tsx` 捕获错误：

```typescript
// 任意页面抛出的错误都会触发
throw new Error('404'); // → Soyorin 春日影梗
```

### 6.2 手动使用

```typescript
import { ErrorPersona } from '@/app/components/ui/ErrorPersona';

// 手动展示特定错误
<ErrorPersona 
  statusCode={503}
  reset={() => window.location.reload()}
/>
```

### 6.3 API错误处理

```typescript
import { getErrorPersona } from '@/app/lib/error-persona';

// 获取错误配置用于API响应
const persona = getErrorPersona(404);
return Response.json({
  error: persona.title,
  message: persona.message,
  character: persona.character,
});
```

---

## 7. 自测清单

### 7.1 EGG-001: 404触发春日影梗

**测试步骤**:
1. 访问不存在的页面 `/this-page-does-not-exist`
2. 验证显示Soyorin角色
3. 验证标题为"なんで春日影やったの！？"
4. 验证紫色主题

**预期结果**: 客服小祥名台词正确显示 ✓

### 7.2 EGG-002: 500触发"つまらない"

**测试步骤**:
1. 触发服务器错误（可通过API模拟）
2. 验证显示Taki角色
3. 验证标题为"つまらない"
4. 验证靛青色主题+闪电效果

**预期结果**: 压力怪台词正确显示 ✓

### 7.3 EGG-003: 503触发"机油...需要休息..."

**测试步骤**:
1. 触发服务不可用状态
2. 验证显示Kaname角色
3. 验证标题为"机油...需要休息..."
4. 验证黄色主题+猫咪效果

**预期结果**: 奶龙娘台词正确显示 ✓

---

## 8. 扩展指南

### 8.1 添加新错误码

```typescript
// app/lib/error-persona.ts
ERROR_PERSONA_MAP[418] = {
  character: 'kaname',
  color: '#FFDD00',
  title: '我是茶壶...喵',
  message: '服务器是个茶壶，正在泡抹茶。',
  icon: '🍵',
  name: 'Rāna',
};
```

### 8.2 添加新角色

```typescript
// 1. 添加角色配色
CHARACTER_GRADIENTS['newchar'] = 'from-red-900/50 via-red-800/30 to-slate-900';

// 2. 添加粒子效果
getCharacterEffects['newchar'] = {
  particleEmoji: '🔥',
  particleCount: 8,
  animationStyle: 'burn',
};
```

### 8.3 自定义样式

```typescript
<ErrorPersona
  statusCode={500}
  animated={false}        // 禁用动画
  showDetails={true}      // 显示错误详情
  homeHref="/dashboard"   // 自定义返回链接
/>
```

---

## 9. 技术规范

### 9.1 TypeScript接口

```typescript
interface ErrorPersona {
  character: string;    // 角色ID
  color: string;        // 主题色 (hex)
  title: string;        // 错误标题 (台词)
  message: string;      // 错误信息
  icon: string;         // Emoji图标
  name: string;         // 角色显示名
  subtitle?: string;    // 副标题/日文名
}
```

### 9.2 兼容性

- **Next.js**: 14+ (App Router)
- **React**: 18+
- **TypeScript**: 5+
- **TailwindCSS**: 3.4+

---

## 10. 彩蛋清单

| 彩蛋ID | 触发条件 | 内容 |
|--------|----------|------|
| EGG-001 | 404错误 | なんで春日影やったの！？ |
| EGG-002 | 500错误 | つまらない |
| EGG-003 | 503错误 | 机油...需要休息... |
| EGG-004 | 401错误 | 你这个人，满脑子只想着自己呢 |
| EGG-005 | 418错误 | 我是茶壶...喵 |

---

## 附录：MyGO!!!!!梗参考

### 经典台词

- **「なんで春日影やったの！？」** - 客服小祥破防名场面
- **「つまらない」** - 立希对不够好的东西的评价
- **「一生バンドやろう」** - 组一辈子乐队
- **「私はこの街で、迷子になる」** - MyGO含义
- **「あなたは自分のことしか考えていない」** - 祥子名言

### 角色昵称

- 高松灯 → Tomori/灯ちゃん
- 千早爱音 → Anon/爱音酱/あのちゃん
- 要乐奈 → Kaname/猫猫/楽奈
- 长崎素世 → Soyo/Soyorin/そよりん
- 椎名立希 → Taki/たき/立希ちゃん
- 丰川祥子 → Saki/祥子/さきちゃん

---

> **设计理念**: *即使是错误页面，也要让MyGO!!!!!的粉丝会心一笑。*
