# Chat Persona V1 设计文档

## 概述

AgentChatDialog 人格化改造 v2 版，为聊天对话框添加发信人头像、主题色气泡和角色署名，增强视觉识别度和用户体验。

## 功能特性

### 1. 主题色消息气泡 (CHAT-001)

根据 Agent 角色显示不同的主题色边框和背景：

| 角色 | 名称 | 边框颜色 | 背景色 |
|------|------|----------|--------|
| pm | 客服小祥 | `#884499` (深紫) | `bg-purple-900/20` |
| arch | 压力怪 | `#7777AA` (深蓝) | `bg-blue-900/20` |
| qa | 咕咕嘎嘎 | `#66BB66` (绿) | `bg-green-900/20` |
| engineer | 奶龙娘 | `#FFDD88` (黄) | `bg-yellow-900/20` |
| mike | Mike | `#EE6677` (红) | `bg-red-900/20` |
| soyorin | Soyorin | `#AA66AA` (紫粉) | `bg-pink-900/20` |

样式配置：
```typescript
const MESSAGE_BUBBLE_STYLES: Record<AgentRole, string> = {
  pm: 'border-l-4 border-[#884499] bg-purple-900/20 hover:bg-purple-900/30',
  arch: 'border-l-4 border-[#7777AA] bg-blue-900/20 hover:bg-blue-900/30',
  qa: 'border-l-4 border-[#66BB66] bg-green-900/20 hover:bg-green-900/30',
  engineer: 'border-l-4 border-[#FFDD88] bg-yellow-900/20 hover:bg-yellow-900/30',
  mike: 'border-l-4 border-[#EE6677] bg-red-900/20 hover:bg-red-900/30',
  soyorin: 'border-l-4 border-[#AA66AA] bg-pink-900/20 hover:bg-pink-900/30',
};
```

### 2. 左侧头像栏 (CHAT-002)

每个消息显示发送者头像，头像使用角色色背景：

```typescript
const AVATAR_BG_STYLES: Record<AgentRole, string> = {
  pm: 'bg-[#884499] shadow-purple-500/50',
  arch: 'bg-[#7777AA] shadow-blue-500/50',
  qa: 'bg-[#66BB66] shadow-green-500/50',
  engineer: 'bg-[#FFAA44] shadow-yellow-500/50',
  mike: 'bg-[#EE6677] shadow-red-500/50',
  soyorin: 'bg-[#AA66AA] shadow-pink-500/50',
};
```

头像显示规则：
- 用户消息：显示 `User` 图标，灰色背景
- Agent 消息：显示对应角色的 emoji 图标

### 3. 底部角色签名 (CHAT-003)

**客服小祥 (pm)** 消息底部显示署名：
- 显示文本：`— 客服小祥`
- 样式：深紫色 (`#884499`)、斜体、中等字重

**压力怪审计 (arch)** 消息显示鼓点图标：
- 图标：`Drum` (来自 lucide-react)
- 动画：`animate-bounce`
- 配套文本：`审计中...`
- 颜色：深蓝色 (`#7777AA`)

## 自测清单

- [x] **CHAT-001**: 消息气泡根据 Agent 角色显示主题色边框
- [x] **CHAT-002**: 客服小祥消息显示深紫头像 + 署名
- [x] **CHAT-003**: 压力怪审计消息显示深蓝头像 + 鼓点图标

## 文件变更

### 更新文件
- `app/components/ui/AgentChatDialog.tsx` - v2人格化版

### 新增文件
- `design/chat-persona-v1.md` - 本设计文档

## 技术实现

### 核心函数

```typescript
// 获取消息样式
const getMessageStyle = (sender: AgentRole | 'user'): string => {
  if (sender === 'user') {
    return 'bg-slate-700 border-l-4 border-slate-500';
  }
  return MESSAGE_BUBBLE_STYLES[sender] || 'border-l-4 border-gray-500 bg-slate-800';
};

// 获取头像样式
const getAvatarStyle = (sender: AgentRole | 'user'): string => {
  if (sender === 'user') {
    return 'bg-slate-600';
  }
  return AVATAR_BG_STYLES[sender] || 'bg-gray-600';
};

// 判断是否显示署名
const showSignature = (sender: AgentRole | 'user'): boolean => {
  return sender === 'pm';
};

// 判断是否显示鼓点图标
const showDrumIcon = (sender: AgentRole | 'user'): boolean => {
  return sender === 'arch';
};
```

### 消息数据结构

```typescript
interface ChatMessage {
  id: string;
  content: string;
  sender: AgentRole | 'user';
  timestamp: number;
  isStreaming?: boolean;
}
```

## 视觉效果

1. **左侧头像栏**: 固定宽度 40px，圆角圆形，带阴影和悬停放大效果
2. **消息气泡**: 左侧 4px 主题色边框，半透明背景，圆角处理
3. **底部署名**: 小号字体，与时间戳同行显示
4. **鼓点动画**: 图标弹跳动画，配合"审计中..."文本

## 兼容性

- 保持向后兼容：用户消息样式不变
- Agent 消息新增主题色支持
- 不修改 ChatMessage 接口定义
