/**
 * State Context Pattern - 状态上下文装备
 * 管理系统状态和运行时信息
 * 
 * @version 1.0.0
 * @module patterns/context/state-context
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

export const StateContextPattern: ContextPattern = {
  meta: {
    id: 'ctx:state',
    name: 'State Context',
    description: '状态上下文装备，管理系统状态和运行时信息',
    version: VERSION,
    author: 'Fabric Team',
    tags: ['context', 'state', 'runtime'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.CONTEXT,
  contextType: ContextType.STATE,
  content: `# CTX:STATE
## SYS
MODE:{{systemMode}}|VER:{{version}}|UPTIME:{{uptime}}

## PERF
CPU:{{cpuUsage}}%|MEM:{{memoryUsage}}%|TOKENS:{{tokenCount}}

## FLAGS
{{featureFlags}}

## ERR
{{errorCount}}|{{lastError}}|{{recoveryStatus}}`,
  variables: [
    { name: 'systemMode', type: 'string', required: false, defaultValue: 'normal', description: '系统模式' },
    { name: 'version', type: 'string', required: false, description: '系统版本' },
    { name: 'uptime', type: 'string', required: false, description: '运行时间' },
    { name: 'cpuUsage', type: 'number', required: false, defaultValue: 0, description: 'CPU使用率' },
    { name: 'memoryUsage', type: 'number', required: false, defaultValue: 0, description: '内存使用率' },
    { name: 'tokenCount', type: 'number', required: false, defaultValue: 0, description: 'Token使用量' },
    { name: 'featureFlags', type: 'object', required: false, defaultValue: {}, description: '功能开关' },
    { name: 'errorCount', type: 'number', required: false, defaultValue: 0, description: '错误计数' },
    { name: 'lastError', type: 'string', required: false, description: '最后错误' },
    { name: 'recoveryStatus', type: 'string', required: false, defaultValue: 'ok', description: '恢复状态' },
  ],
  fragments: [
    {
      type: ContextType.STATE,
      content: '系统状态上下文',
      priority: 6,
      ttl: 60,
    },
  ],
  maxTokens: 300,
  evictionPolicy: 'fifo',
  tokenOpt: TOKEN_OPT,
  dependencies: [],
};

export default StateContextPattern;
