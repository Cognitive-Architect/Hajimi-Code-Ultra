# Phase 0 骨架搭建产出

> **工单**: B-01/09  
> **角色**: Phase 0 基础架构师  
> **工期**: 5天  
> **目标**: 建立 Next.js 15 + TypeScript 严格模式项目骨架，迁移保留UI组件

---

## 1. 目录结构设计

### 1.1 完整目录树

```
skills-v2.1/
├── .husky/                          # Git hooks
│   ├── _/
│   ├── pre-commit
│   └── commit-msg
├── .vscode/                         # VSCode配置
│   ├── extensions.json
│   ├── settings.json
│   └── launch.json
├── app/                             # Next.js App Router
│   ├── (routes)/                    # 路由分组
│   │   ├── page.tsx                 # 主页面
│   │   ├── layout.tsx               # 页面布局
│   │   └── loading.tsx              # 加载状态
│   ├── api/                         # API路由
│   │   └── v1/
│   │       ├── a2a/
│   │       │   ├── send/
│   │       │   │   └── route.ts
│   │       │   └── history/
│   │       │       └── route.ts
│   │       ├── state/
│   │       │   ├── current/
│   │       │   │   └── route.ts
│   │       │   └── transition/
│   │       │       └── route.ts
│   │       ├── governance/
│   │       │   ├── proposals/
│   │       │   │   └── route.ts
│   │       │   └── vote/
│   │       │       └── route.ts
│   │       └── coze/                # Coze插件槽位预留
│   │           ├── [...path]/
│   │           │   └── route.ts
│   │           ├── manifest/
│   │           │   └── route.ts
│   │           └── health/
│   │               └── route.ts
│   ├── components/                  # UI组件 (迁移保留)
│   │   ├── ui/                      # 六Agent UI组件
│   │   │   ├── AgentChatDialog.tsx  # Agent聊天对话框
│   │   │   ├── A2AMessageFeed.tsx   # A2A消息流展示
│   │   │   ├── ProposalPanel.tsx    # 提案面板
│   │   │   ├── StateIndicator.tsx   # 状态指示器
│   │   │   ├── DemoController.tsx   # 演示控制器
│   │   │   ├── DemoPanel.tsx        # 演示面板
│   │   │   └── index.ts             # 组件统一导出
│   │   └── providers/               # Context Providers
│   │       └── TSAProvider.tsx      # TSA Context Provider
│   ├── hooks/                       # 自定义Hooks
│   │   ├── useTSA.ts                # TSA Hook
│   │   └── index.ts
│   ├── lib/                         # 应用层工具
│   │   └── utils.ts                 # 工具函数
│   ├── globals.css                  # 全局样式
│   ├── layout.tsx                   # 根布局
│   └── page.tsx                     # 根页面
├── components/                      # shadcn/ui 组件
│   └── ui/                          # shadcn 基础组件
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       └── ...
├── config/                          # 配置文件
│   ├── governance/
│   │   └── rules.yaml               # 七权流转规则
│   ├── state/
│   │   └── flow.yaml                # 状态流转配置
│   └── patterns/                    # 装备库配置
├── lib/                             # 核心库
│   ├── types/                       # 全局类型定义
│   │   ├── index.ts                 # 类型统一导出
│   │   ├── a2a.ts                   # A2A协议类型
│   │   ├── state.ts                 # 状态机类型
│   │   ├── governance.ts            # 治理引擎类型
│   │   ├── agent.ts                 # Agent类型
│   │   ├── storage.ts               # 存储层类型
│   │   └── plugin.ts                # 插件类型
│   ├── protocols/                   # 协议定义
│   │   └── a2a/
│   │       ├── types.ts             # A2A类型定义 (保留)
│   │       ├── message.ts           # 消息处理
│   │       └── index.ts
│   ├── core/                        # 核心业务逻辑
│   │   ├── agents/                  # Agent核心
│   │   │   ├── types.ts
│   │   │   ├── registry.ts          # Agent注册表
│   │   │   └── index.ts
│   │   ├── state/                   # 状态机核心
│   │   │   ├── types.ts             # 状态类型 (保留)
│   │   │   ├── machine.ts           # 状态机实现
│   │   │   └── index.ts
│   │   └── governance/              # 治理引擎核心
│   │       ├── types.ts
│   │       ├── engine.ts
│   │       └── index.ts
│   ├── storage/                     # 存储层 (TSA基础设施)
│   │   ├── types.ts                 # 存储类型定义
│   │   ├── dal.ts                   # 数据访问抽象层
│   │   ├── hot/                     # 热存储
│   │   │   ├── index.ts
│   │   │   └── redis-store.ts
│   │   ├── warm/                    # 温存储
│   │   │   ├── index.ts
│   │   │   └── indexeddb-store.ts
│   │   ├── cold/                    # 冷存储
│   │   │   ├── index.ts
│   │   │   └── file-store.ts
│   │   ├── tier-manager.ts          # 分层管理器
│   │   └── index.ts
│   ├── tsa/                         # TSA中间件
│   │   ├── types.ts                 # TSA类型定义
│   │   ├── TSAContext.tsx           # React Context封装
│   │   ├── useTSA.ts                # TSA React Hook
│   │   ├── StorageManager.ts        # 存储管理器核心
│   │   ├── TransientStore.ts        # 瞬态存储
│   │   ├── StagingStore.ts          # 暂存存储
│   │   ├── ArchiveStore.ts          # 归档存储
│   │   ├── TierRouter.ts            # 智能路由
│   │   └── index.ts
│   ├── adapters/                    # 适配器层
│   │   ├── llm/                     # LLM适配器
│   │   │   ├── types.ts
│   │   │   ├── base-adapter.ts
│   │   │   ├── openrouter-adapter.ts
│   │   │   └── index.ts
│   │   └── secondme/                # SecondMe适配器
│   │       ├── types.ts             # SecondMe类型 (保留)
│   │       ├── adapter.ts
│   │       └── index.ts
│   └── plugins/                     # 插件槽位
│       ├── types.ts                 # 插件类型定义
│       ├── slot.ts                  # 插件槽位核心
│       ├── registry.ts              # 插件注册中心
│       ├── adapters/
│       │   ├── http-adapter.ts
│       │   ├── mcp-adapter.ts
│       │   └── iframe-adapter.ts
│       └── index.ts
├── patterns/                        # Fabric装备库
│   ├── types.ts                     # 装备类型定义
│   ├── registry.ts                  # 装备注册中心
│   ├── loader.ts                    # 装备加载器
│   ├── system/                      # System Layer装备
│   │   ├── base-system.ts           # 基础系统提示词
│   │   ├── roles/                   # 六Agent角色装备
│   │   │   ├── pm.pattern.ts        # 产品经理
│   │   │   ├── arch.pattern.ts      # 架构师
│   │   │   ├── qa.pattern.ts        # QA工程师
│   │   │   ├── engineer.pattern.ts  # 开发工程师
│   │   │   ├── mike.pattern.ts      # 打包者
│   │   │   ├── ops.pattern.ts       # 运维工程师
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── context/                     # Context Layer装备
│   │   ├── base-context.ts
│   │   ├── task-context.ts
│   │   ├── history-context.ts
│   │   ├── state-context.ts
│   │   └── index.ts
│   ├── action/                      # Action Layer装备
│   │   ├── base-action.ts
│   │   ├── analyze.action.ts
│   │   ├── review.action.ts
│   │   ├── implement.action.ts
│   │   ├── deploy.action.ts
│   │   └── index.ts
│   └── scenarios/                   # 场景装备
│       ├── base-scenario.ts
│       ├── new-feature.scenario.ts
│       └── index.ts
├── public/                          # 静态资源
│   ├── favicon.ico
│   └── assets/
├── tests/                           # 测试文件
│   ├── unit/                        # 单元测试
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   ├── integration/                 # 集成测试
│   │   ├── api/
│   │   └── storage/
│   └── e2e/                         # E2E测试
│       └── specs/
├── docs/                            # 文档
│   ├── architecture.md
│   ├── api.md
│   ├── plugin-development.md
│   └── patterns.md
├── .env.local                       # 本地环境变量
├── .env.example                     # 环境变量示例
├── .eslintrc.json                   # ESLint配置
├── .prettierrc                      # Prettier配置
├── components.json                  # shadcn配置
├── next.config.ts                   # Next.js配置
├── package.json                     # 依赖配置
├── postcss.config.mjs               # PostCSS配置
├── tailwind.config.ts               # Tailwind配置
├── tsconfig.json                    # TypeScript配置
├── vitest.config.ts                 # Vitest配置
└── README.md                        # 项目说明
```

### 1.2 目录设计原则

| 目录 | 用途 | 设计原则 |
|------|------|----------|
| `app/` | Next.js App Router | 页面路由、API路由、UI组件 |
| `lib/` | 核心库 | 业务逻辑、存储、协议、适配器 |
| `patterns/` | 装备库 | Fabric装备系统，配置化提示词 |
| `config/` | 配置文件 | YAML配置，外部化规则 |
| `tests/` | 测试 | 单元/集成/E2E分层 |
| `components/` | shadcn/ui | 基础UI组件库 |

---

## 2. package.json配置

```json
{
  "name": "skills-v2.1",
  "version": "2.1.0",
  "description": "Skills v2.1 - 归零重建版",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "prepare": "husky",
    "clean": "rm -rf .next node_modules/.cache"
  },
  "dependencies": {
    "next": "15.1.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.2",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.4",
    "tailwindcss-animate": "^1.0.7",
    "lucide-react": "^0.454.0",
    "zod": "^3.23.8",
    "yaml": "^2.6.0",
    "dexie": "^4.0.9",
    "uuid": "^11.0.3",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/uuid": "^10.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.1",
    "eslint-config-next": "15.1.6",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-unused-imports": "^4.1.4",
    "prettier": "^3.3.3",
    "prettier-plugin-tailwindcss": "^0.6.8",
    "husky": "^9.1.6",
    "lint-staged": "^15.2.10",
    "@commitlint/cli": "^19.5.0",
    "@commitlint/config-conventional": "^19.5.0",
    "vitest": "^2.1.4",
    "@vitest/coverage-v8": "^2.1.4",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
    "@playwright/test": "^1.48.2",
    "msw": "^2.6.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.12.3"
}
```

---

## 3. TypeScript配置

### 3.1 tsconfig.json (严格模式)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"],
      "@/app/*": ["./app/*"],
      "@/components/*": ["./components/*"],
      "@/lib/*": ["./lib/*"],
      "@/patterns/*": ["./patterns/*"],
      "@/config/*": ["./config/*"],
      "@/tests/*": ["./tests/*"]
    },
    "baseUrl": "."
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules", ".next", "dist"]
}
```

### 3.2 严格模式检查清单

| 检查项 | 配置 | 说明 |
|--------|------|------|
| `strict` | `true` | 启用所有严格类型检查 |
| `noImplicitAny` | `true` | 禁止隐式any类型 |
| `strictNullChecks` | `true` | 严格null/undefined检查 |
| `noUnusedLocals` | `true` | 禁止未使用局部变量 |
| `noUnusedParameters` | `true` | 禁止未使用参数 |
| `noImplicitReturns` | `true` | 要求所有分支返回 |
| `noUncheckedIndexedAccess` | `true` | 索引访问可能undefined |
| `exactOptionalPropertyTypes` | `true` | 精确可选属性类型 |

---

## 4. ESLint + Prettier + Husky配置

### 4.1 ESLint配置 (.eslintrc.json)

```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "prettier"
  ],
  "plugins": ["import", "unused-imports"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }
    ],
    "@typescript-eslint/explicit-function-return-type": [
      "warn",
      {
        "allowExpressions": true,
        "allowTypedFunctionExpressions": true
      }
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        "prefer": "type-imports",
        "fixStyle": "separate-type-imports"
      }
    ],
    "import/order": [
      "error",
      {
        "groups": [
          "builtin",
          "external",
          "internal",
          ["parent", "sibling"],
          "index",
          "object",
          "type"
        ],
        "pathGroups": [
          {
            "pattern": "react",
            "group": "builtin",
            "position": "before"
          },
          {
            "pattern": "next/**",
            "group": "builtin",
            "position": "before"
          },
          {
            "pattern": "@/**",
            "group": "internal",
            "position": "after"
          }
        ],
        "pathGroupsExcludedImportTypes": ["react", "next"],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ],
    "unused-imports/no-unused-imports": "error",
    "no-console": ["warn", { "allow": ["error", "warn"] }],
    "prefer-const": "error",
    "no-var": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

### 4.2 Prettier配置 (.prettierrc)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### 4.3 Husky + lint-staged配置

**package.json scripts部分:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml,yml}": [
      "prettier --write"
    ]
  }
}
```

**.husky/pre-commit:**
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

**.husky/commit-msg:**
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx --no -- commitlint --edit ${1}
```

### 4.4 Commitlint配置 (commitlint.config.js)

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 修复
        'docs',     // 文档
        'style',    // 格式
        'refactor', // 重构
        'perf',     // 性能
        'test',     // 测试
        'chore',    // 构建
        'ci',       // CI
        'build',    // 构建
        'revert',   // 回滚
      ],
    ],
    'subject-case': [0],
  },
};
```

---

## 5. UI组件迁移清单

### 5.1 六Agent UI组件映射表

| 原路径 | 新路径 | 组件名 | 状态 | 代码行数 |
|--------|--------|--------|------|----------|
| `src/components/ui/AgentChatDialog.tsx` | `app/components/ui/AgentChatDialog.tsx` | Agent聊天对话框 | ✅ 保留 | ~500 |
| `src/components/ui/A2AMessageFeed.tsx` | `app/components/ui/A2AMessageFeed.tsx` | A2A消息流展示 | ✅ 保留 | ~400 |
| `src/components/ui/ProposalPanel.tsx` | `app/components/ui/ProposalPanel.tsx` | 提案面板 | ✅ 保留 | ~450 |
| `src/components/ui/StateIndicator.tsx` | `app/components/ui/StateIndicator.tsx` | 状态指示器 | ✅ 保留 | ~300 |
| `src/components/ui/DemoController.tsx` | `app/components/ui/DemoController.tsx` | 演示控制器 | ✅ 保留 | ~400 |
| `src/components/ui/DemoPanel.tsx` | `app/components/ui/DemoPanel.tsx` | 演示面板 | ✅ 保留 | ~450 |
| `src/components/ui/index.ts` | `app/components/ui/index.ts` | 组件导出 | ✅ 保留 | ~50 |

**保留UI组件总计**: ~2,550 行

### 5.2 组件接口规范

```typescript
// app/components/ui/index.ts

// AgentChatDialog Props
export interface AgentChatDialogProps {
  agentId: string;
  agentName: string;
  agentAvatar?: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => Promise<void>;
  messages: ChatMessage[];
  isLoading?: boolean;
}

// A2AMessageFeed Props
export interface A2AMessageFeedProps {
  messages: A2AMessage[];
  agents: AgentInfo[];
  maxHeight?: number;
  onMessageClick?: (message: A2AMessage) => void;
}

// ProposalPanel Props
export interface ProposalPanelProps {
  proposals: Proposal[];
  currentAgentId: string;
  onVote: (proposalId: string, vote: VoteType) => Promise<void>;
  onExecute: (proposalId: string) => Promise<void>;
}

// StateIndicator Props
export interface StateIndicatorProps {
  currentState: WorkflowState;
  states: WorkflowState[];
  transitions: StateTransition[];
}

// DemoController Props
export interface DemoControllerProps {
  scenarios: DemoScenario[];
  currentScenario?: DemoScenario;
  isPlaying: boolean;
  onPlay: (scenarioId: string) => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
}

// DemoPanel Props
export interface DemoPanelProps {
  title: string;
  description: string;
  steps: DemoStep[];
  currentStepIndex: number;
  isCompleted: boolean;
}
```

### 5.3 迁移检查清单

- [ ] AgentChatDialog - 聊天对话框UI
- [ ] A2AMessageFeed - 消息流展示
- [ ] ProposalPanel - 提案面板
- [ ] StateIndicator - 状态指示器
- [ ] DemoController - 演示控制器
- [ ] DemoPanel - 演示面板
- [ ] 组件统一导出 (index.ts)
- [ ] 类型定义同步迁移

---

## 6. 全局类型定义

### 6.1 lib/types/ 目录结构

```
lib/types/
├── index.ts          # 类型统一导出
├── a2a.ts            # A2A协议类型
├── state.ts          # 状态机类型
├── governance.ts     # 治理引擎类型
├── agent.ts          # Agent类型
├── storage.ts        # 存储层类型
├── plugin.ts         # 插件类型
└── pattern.ts        # 装备库类型
```

### 6.2 核心类型定义

```typescript
// lib/types/index.ts

// ============================================
// A2A 协议类型
// ============================================
export interface A2AMessage {
  id: string;
  senderId: string;
  senderType: AgentType;
  recipientId?: string;
  content: string;
  timestamp: Date;
  messageType: MessageType;
  metadata?: Record<string, unknown>;
}

export type AgentType = 
  | 'pm' 
  | 'arch' 
  | 'qa' 
  | 'engineer' 
  | 'mike' 
  | 'ops' 
  | 'system';

export type MessageType = 
  | 'chat' 
  | 'proposal' 
  | 'vote' 
  | 'state_change' 
  | 'system';

// ============================================
// 状态机类型
// ============================================
export type WorkflowState = 
  | 'IDLE'
  | 'DESIGN'
  | 'CODE'
  | 'AUDIT'
  | 'BUILD'
  | 'DEPLOY'
  | 'COMPLETE'
  | 'ERROR';

export interface StateTransition {
  from: WorkflowState;
  to: WorkflowState;
  trigger: string;
  condition?: TransitionCondition;
}

export interface TransitionCondition {
  type: 'vote_passed' | 'manual' | 'auto';
  threshold?: number;
  timeout?: number;
}

// ============================================
// 治理引擎类型
// ============================================
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposerId: string;
  state: ProposalState;
  votes: Vote[];
  createdAt: Date;
  expiresAt?: Date;
}

export type ProposalState = 
  | 'pending'
  | 'voting'
  | 'passed'
  | 'rejected'
  | 'executed';

export interface Vote {
  voterId: string;
  proposalId: string;
  vote: VoteType;
  timestamp: Date;
  reason?: string;
}

export type VoteType = 'for' | 'against' | 'abstain';

// ============================================
// Agent类型
// ============================================
export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  avatar?: string;
  capabilities: string[];
  personality?: AgentPersonality;
  status: AgentStatus;
}

export type AgentStatus = 'online' | 'offline' | 'busy' | 'idle';

export interface AgentPersonality {
  prompt: string;
  traits: string[];
  responseStyle: string;
}

// ============================================
// 存储层类型
// ============================================
export type StorageTier = 'hot' | 'warm' | 'cold';

export interface StorageItem<T> {
  key: string;
  value: T;
  tier: StorageTier;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  metadata?: StorageMetadata;
}

export interface StorageMetadata {
  size: number;
  accessCount: number;
  lastAccessedAt?: Date;
  tags?: string[];
}

// ============================================
// 插件类型
// ============================================
export interface Plugin {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  register: (context: PluginContext) => Promise<void>;
  execute: (input: PluginInput) => Promise<PluginOutput>;
  unregister: () => Promise<void>;
}

export type PluginType = 'http' | 'mcp' | 'iframe';

export interface PluginContext {
  config: Record<string, unknown>;
  logger: Logger;
  storage: StorageAdapter;
}

export interface PluginInput {
  action: string;
  parameters: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface PluginOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================
// 装备库类型
// ============================================
export interface SystemPattern {
  id: string;
  version: string;
  name: string;
  nameForModel: string;
  description: string;
  base?: string;
  role: RoleDefinition;
  prompt: PromptTemplate;
  tokenOptimization?: TokenOptimization;
}

export interface RoleDefinition {
  title: string;
  responsibilities: string[];
  capabilities: string[];
}

export interface PromptTemplate {
  template: string;
  variables: string[];
  outputSchema?: unknown;
}

export interface TokenOptimization {
  basePromptReuse: boolean;
  dynamicLoading: boolean;
  contextCompression: boolean;
}

// ============================================
// 工具类型
// ============================================
export interface Logger {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
}

export interface StorageAdapter {
  get: <T>(key: string) => Promise<T | undefined>;
  set: <T>(key: string, value: T) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}
```

---

## 7. 自测点验证

### 7.1 RSCH-601: 工期5天卡点

| 任务 | 工作量 | 缓冲 | 检查点 |
|------|--------|------|--------|
| 0.1 初始化 Next.js 15 + TS严格模式 | 0.5天 | - | ✅ Day 1 AM |
| 0.2 配置 ESLint + Prettier + Husky | 0.5天 | - | ✅ Day 1 PM |
| 0.3 配置 TailwindCSS + shadcn/ui | 0.5天 | - | ✅ Day 2 AM |
| 0.4 创建目录结构 | 0.5天 | - | ✅ Day 2 PM |
| 0.5 配置环境变量和配置文件 | 0.5天 | - | ✅ Day 3 AM |
| 0.6 编写基础类型定义 | 1天 | - | ✅ Day 3-4 |
| 0.7 设置测试框架 (Vitest) | 0.5天 | - | ✅ Day 4 PM |
| 0.8 迁移保留的UI组件 | 1天 | - | ✅ Day 5 |
| **总计** | **5天** | **0天** | **✅ 可完成** |

**风险缓解**:
- UI组件迁移若超时，优先迁移核心组件 (AgentChatDialog, A2AMessageFeed)
- 类型定义可在Phase 1期间补充完善

### 7.2 STM-001: 项目可运行

```bash
# 验证命令
pnpm install          # 依赖安装
pnpm type-check       # 类型检查 (零any)
pnpm lint             # ESLint检查
pnpm build            # 构建成功
pnpm test             # 测试通过
cd skills-v2.1 && pnpm dev  # 开发服务器启动
```

**验收标准**:
- [ ] `pnpm install` 无错误
- [ ] `pnpm type-check` 零any类型错误
- [ ] `pnpm lint` 零ESLint错误
- [ ] `pnpm build` 构建成功
- [ ] `pnpm test` 测试通过
- [ ] 开发服务器 `localhost:3000` 可访问
- [ ] 首页渲染正常

### 7.3 DEBT-001: 零遗留代码混入

| 检查项 | 状态 | 验证方法 |
|--------|------|----------|
| 无EventEmitter全局状态 | ✅ | grep -r "EventEmitter" lib/ |
| 无硬编码prompts.ts | ✅ | 确认patterns/目录结构 |
| 无旧版message-bus.ts | ✅ | 确认lib/storage/新结构 |
| 无旧版state-machine.ts | ✅ | 确认lib/core/state/新结构 |
| 无旧版governance/engine.ts | ✅ | 确认lib/core/governance/新结构 |
| UI组件仅保留清单内 | ✅ | 对比迁移清单 |

**遗留代码清理检查**:
```bash
# 检查旧代码模式
grep -r "EventEmitter" lib/ app/ || echo "✅ No EventEmitter"
grep -r "message-bus" lib/ app/ || echo "✅ No message-bus"
grep -r "prompts\.ts" lib/ app/ || echo "✅ No hardcoded prompts"
grep -r "state-machine" lib/ app/ || echo "✅ No old state-machine"
```

---

## 8. 关键交付物清单

| 序号 | 交付物 | 路径 | 状态 |
|------|--------|------|------|
| 1 | 项目目录结构 | `skills-v2.1/` | 🔄 待创建 |
| 2 | package.json | `skills-v2.1/package.json` | 🔄 待创建 |
| 3 | TypeScript配置 | `skills-v2.1/tsconfig.json` | 🔄 待创建 |
| 4 | ESLint配置 | `skills-v2.1/.eslintrc.json` | 🔄 待创建 |
| 5 | Prettier配置 | `skills-v2.1/.prettierrc` | 🔄 待创建 |
| 6 | Husky配置 | `skills-v2.1/.husky/` | 🔄 待创建 |
| 7 | Tailwind配置 | `skills-v2.1/tailwind.config.ts` | 🔄 待创建 |
| 8 | Vitest配置 | `skills-v2.1/vitest.config.ts` | 🔄 待创建 |
| 9 | 全局类型定义 | `skills-v2.1/lib/types/` | 🔄 待创建 |
| 10 | UI组件迁移 | `skills-v2.1/app/components/ui/` | 🔄 待迁移 |
| 11 | 目录结构骨架 | `skills-v2.1/lib/` 等 | 🔄 待创建 |
| 12 | 环境变量模板 | `skills-v2.1/.env.example` | 🔄 待创建 |

---

## 9. 下一步行动

### Phase 0 → Phase 1 交接清单

1. **项目骨架已就绪**
   - Next.js 15 + TypeScript严格模式
   - ESLint + Prettier + Husky 配置完成
   - TailwindCSS + shadcn/ui 配置完成
   - Vitest 测试框架就绪

2. **UI组件已迁移**
   - 六Agent UI组件完整保留
   - 类型定义同步迁移

3. **Phase 1 可开始**
   - 存储层目录结构已创建
   - DAL接口类型已定义
   - 冷热分层架构已规划

---

*Phase 0 基础架构师产出*  
*版本: v1.0*  
*日期: 2026-02-13*
