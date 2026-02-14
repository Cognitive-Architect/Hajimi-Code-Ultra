/**
 * Analyze Action Pattern - 分析动作装备
 * 执行分析任务的标准流程
 * 
 * @version 1.0.0
 * @module patterns/action/analyze
 */

import { ActionPattern, PatternType, ActionType, PatternVersion, TokenOptimization } from '../types';

const VERSION: PatternVersion = { major: 1, minor: 0, patch: 0 };

const TOKEN_OPT: TokenOptimization = {
  enabled: true,
  compressionRatio: 0.25,
  useAbbreviations: true,
  stripComments: true,
  minifyWhitespace: true,
};

export const AnalyzeActionPattern: ActionPattern = {
  meta: {
    id: 'act:analyze',
    name: 'Analyze Action',
    description: '分析动作装备，执行问题分析和需求理解任务',
    version: VERSION,
    author: 'Fabric Team',
    tags: ['action', 'analyze', 'thinking'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.ACTION,
  actionType: ActionType.ANALYZE,
  content: `# ACT:ANALYZE
## INPUT
{{input}}

## SCOPE
{{scope}}

## OUTPUT
{{expectedOutput}}`,
  variables: [
    { name: 'input', type: 'string', required: true, description: '待分析内容' },
    { name: 'scope', type: 'string', required: false, defaultValue: 'full', description: '分析范围' },
    { name: 'expectedOutput', type: 'string', required: false, description: '期望输出格式' },
    { name: 'constraints', type: 'array', required: false, defaultValue: [], description: '约束条件' },
  ],
  steps: [
    {
      id: 'analyze-1',
      name: '理解问题',
      description: '理解用户提出的问题和需求',
      prompt: '仔细阅读用户输入，识别核心问题和隐含需求。列出：1)明确提出的问题 2)潜在需求 3)约束条件',
      validation: '必须识别至少一个核心问题',
    },
    {
      id: 'analyze-2',
      name: '拆解要素',
      description: '将问题拆解为可处理的要素',
      prompt: '将问题拆解为：1)关键概念 2)依赖关系 3)输入输出 4)边界条件',
      validation: '要素之间不能有重叠',
    },
    {
      id: 'analyze-3',
      name: '分析关联',
      description: '分析各要素之间的关联',
      prompt: '分析：1)因果关系 2)依赖关系 3)优先级 4)潜在冲突',
    },
    {
      id: 'analyze-4',
      name: '形成结论',
      description: '形成分析结论和建议',
      prompt: '总结：1)核心发现 2)关键洞察 3)建议方案 4)风险提示',
      validation: '结论必须基于前面的分析',
    },
  ],
  preconditions: [
    '输入内容不为空',
    '分析范围已明确',
  ],
  postconditions: [
    '分析结论已产出',
    '关键发现已记录',
  ],
  timeout: 120000,
  tokenOpt: TOKEN_OPT,
  dependencies: ['ctx:task'],
};

export default AnalyzeActionPattern;
