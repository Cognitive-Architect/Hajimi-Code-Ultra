/**
 * Review Action Pattern - 审查动作装备
 * 执行代码/文档审查的标准流程
 * 
 * @version 1.0.0
 * @module patterns/action/review
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

export const ReviewActionPattern: ActionPattern = {
  meta: {
    id: 'act:review',
    name: 'Review Action',
    description: '审查动作装备，执行代码和文档的审查任务',
    version: VERSION,
    author: 'Fabric Team',
    tags: ['action', 'review', 'quality'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.ACTION,
  actionType: ActionType.REVIEW,
  content: `# ACT:REVIEW
## TARGET
{{target}}

## TYPE
{{reviewType}}

## STD
{{standards}}`,
  variables: [
    { name: 'target', type: 'string', required: true, description: '审查目标' },
    { name: 'reviewType', type: 'string', required: false, defaultValue: 'general', description: '审查类型' },
    { name: 'standards', type: 'array', required: false, defaultValue: [], description: '审查标准' },
    { name: 'focusAreas', type: 'array', required: false, defaultValue: [], description: '重点关注区域' },
  ],
  steps: [
    {
      id: 'review-1',
      name: '概览扫描',
      description: '快速扫描整体结构和风格',
      prompt: '进行概览扫描：1)整体结构是否清晰 2)命名是否规范 3)格式是否统一 4)注释是否充分',
    },
    {
      id: 'review-2',
      name: '详细审查',
      description: '逐行详细审查',
      prompt: '逐行审查：1)逻辑正确性 2)边界处理 3)异常处理 4)性能考虑 5)安全问题',
      validation: '必须记录所有发现的问题',
    },
    {
      id: 'review-3',
      name: '标准对照',
      description: '对照标准规范检查',
      prompt: '对照标准检查：1)是否符合编码规范 2)是否符合架构原则 3)是否符合最佳实践',
    },
    {
      id: 'review-4',
      name: '总结反馈',
      description: '总结审查结果并提供反馈',
      prompt: '总结：1)问题分类统计 2)严重程度分级 3)修改建议 4)优先级排序',
      validation: '必须提供可执行的修改建议',
    },
  ],
  preconditions: [
    '审查目标已明确',
    '审查标准已加载',
  ],
  postconditions: [
    '审查报告已产出',
    '问题清单已记录',
  ],
  timeout: 180000,
  tokenOpt: TOKEN_OPT,
  dependencies: ['ctx:task'],
};

export default ReviewActionPattern;
