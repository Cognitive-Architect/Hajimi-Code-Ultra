/**
 * History Context Pattern - 历史上下文装备
 * 管理对话历史和交互记录
 * 
 * @version 1.0.0
 * @module patterns/context/history-context
 */

import { ContextPattern, PatternType, ContextType, PatternVersion, TokenOptimization } from '../types';

const VERSION: PatternVersion = { major: 1, minor: 0, patch: 0 };

const TOKEN_OPT: TokenOptimization = {
  enabled: true,
  compressionRatio: 0.25,
  useAbbreviations: true,
  stripComments: true,
  minifyWhitespace: true,
};

export const HistoryContextPattern: ContextPattern = {
  meta: {
    id: 'ctx:history',
    name: 'History Context',
    description: '历史上下文装备，管理对话历史和交互记录',
    version: VERSION,
    author: 'Fabric Team',
    tags: ['context', 'history', 'conversation'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.CONTEXT,
  contextType: ContextType.HISTORY,
  content: `# CTX:HIST
## SUMMARY
{{summary}}

## LAST
{{lastInteraction}}

## KEY
{{keyPoints}}

## CNT
{{interactionCount}}|{{sessionDuration}}|{{userSatisfaction}}`,
  variables: [
    { name: 'summary', type: 'string', required: false, defaultValue: '', description: '对话摘要' },
    { name: 'lastInteraction', type: 'string', required: false, description: '上次交互内容' },
    { name: 'keyPoints', type: 'array', required: false, defaultValue: [], description: '关键信息点' },
    { name: 'interactionCount', type: 'number', required: false, defaultValue: 0, description: '交互次数' },
    { name: 'sessionDuration', type: 'string', required: false, description: '会话时长' },
    { name: 'userSatisfaction', type: 'string', required: false, defaultValue: 'unknown', description: '用户满意度' },
    { name: 'recentMessages', type: 'array', required: false, defaultValue: [], description: '最近消息列表' },
  ],
  fragments: [
    {
      type: ContextType.HISTORY,
      content: '对话历史上下文',
      priority: 8,
      ttl: 1800,
    },
  ],
  maxTokens: 800,
  evictionPolicy: 'lru',
  tokenOpt: TOKEN_OPT,
  dependencies: [],
};

export default HistoryContextPattern;
